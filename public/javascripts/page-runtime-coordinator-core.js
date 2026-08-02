"use strict";

var DEFAULT_ACCEPTED_STATES = [
    "succeeded",
    "not-required"
];

var TERMINAL_STATES = [
    "succeeded",
    "not-required",
    "degraded",
    "failed",
    "timed-out",
    "blocked",
    "skipped"
];

function copy(value) {
    if (value === undefined) {
        return undefined;
    }

    return JSON.parse(JSON.stringify(value));
}

function errorMessage(error) {
    if (error && error.message) {
        return error.message;
    }

    return String(error);
}

function Coordinator(options) {
    options = options || {};

    this.maxEvents =
        typeof options.maxEvents === "number"
            ? options.maxEvents
            : 250;

    this.tasks = {};
    this.events = [];
    this.nextSequence = 1;
    this.nextOperationId = 1;
    this.started = false;
    this.context = null;
}

Coordinator.prototype.record = function(type, taskId, details) {
    var event = {
        sequence: this.nextSequence,
        type: type,
        taskId: taskId || null
    };

    if (details !== undefined) {
        event.details = copy(details);
    }

    this.nextSequence += 1;
    this.events.push(event);

    if (this.events.length > this.maxEvents) {
        this.events.shift();
    }

    return event;
};

Coordinator.prototype.register = function(specification) {
    var task;

    if (!specification || typeof specification.id !== "string") {
        throw new Error(
            "Coordinator tasks require a string id."
        );
    }

    if (this.tasks[specification.id]) {
        throw new Error(
            "Duplicate coordinator task: " +
            specification.id
        );
    }

    if (
        specification.dependsOn !== undefined &&
        !Array.isArray(specification.dependsOn)
    ) {
        throw new Error(
            "dependsOn must be an array for task " +
            specification.id
        );
    }

    if (
        specification.run !== undefined &&
        typeof specification.run !== "function"
    ) {
        throw new Error(
            "run must be a function for task " +
            specification.id
        );
    }

    if (
        specification.recoveryPolicy !== undefined &&
        specification.recoveryPolicy !== "reject-late" &&
        specification.recoveryPolicy !== "allow-late-success"
    ) {
        throw new Error(
            "Unsupported recoveryPolicy for task " +
            specification.id
        );
    }

    task = {
        id: specification.id,
        dependsOn: (
            specification.dependsOn || []
        ).slice(),
        accepts: copy(
            specification.accepts || {}
        ),
        timeoutMs:
            typeof specification.timeoutMs === "number"
                ? specification.timeoutMs
                : null,
        recoveryPolicy:
            specification.recoveryPolicy ||
            "reject-late",
        run: specification.run || null,
        state: "registered",
        result: undefined,
        error: null,
        blockedBy: [],
        timer: null,
        attempt: 0,
        operationId: null
    };

    this.tasks[task.id] = task;

    this.record(
        "task-registered",
        task.id,
        {
            dependsOn: task.dependsOn,
            timeoutMs: task.timeoutMs,
            recoveryPolicy:
                task.recoveryPolicy
        }
    );

    return this;
};

Coordinator.prototype.acceptedStates = function(
    task,
    dependencyId
) {
    var configured =
        task.accepts &&
        task.accepts[dependencyId];

    return Array.isArray(configured)
        ? configured
        : DEFAULT_ACCEPTED_STATES;
};

Coordinator.prototype.isTerminal = function(state) {
    return TERMINAL_STATES.indexOf(state) >= 0;
};

Coordinator.prototype.validate = function() {
    var self = this;
    var visiting = {};
    var visited = {};

    Object.keys(this.tasks).forEach(function(taskId) {
        self.tasks[taskId].dependsOn.forEach(
            function(dependencyId) {
                if (!self.tasks[dependencyId]) {
                    throw new Error(
                        "Missing coordinator dependency " +
                        dependencyId +
                        " required by " +
                        taskId
                    );
                }
            }
        );
    });

    function visit(taskId, path) {
        if (visiting[taskId]) {
            throw new Error(
                "Coordinator dependency cycle: " +
                path.concat(taskId).join(" -> ")
            );
        }

        if (visited[taskId]) {
            return;
        }

        visiting[taskId] = true;

        self.tasks[taskId].dependsOn.forEach(
            function(dependencyId) {
                visit(
                    dependencyId,
                    path.concat(taskId)
                );
            }
        );

        visiting[taskId] = false;
        visited[taskId] = true;
    }

    Object.keys(this.tasks).forEach(function(taskId) {
        visit(taskId, []);
    });

    return true;
};

Coordinator.prototype.transition = function(
    task,
    state,
    details
) {
    if (
        task.state === state &&
        details === undefined
    ) {
        return;
    }

    task.state = state;

    if (details && details.result !== undefined) {
        task.result = details.result;
    }

    if (details && details.error !== undefined) {
        task.error = details.error;
    }

    if (details && details.blockedBy) {
        task.blockedBy =
            details.blockedBy.slice();
    }

    this.record(
        "task-state",
        task.id,
        {
            state: state,
            operationId:
                task.operationId,
            result: task.result,
            error: task.error,
            blockedBy: task.blockedBy
        }
    );
};

Coordinator.prototype.dependencyEvaluation = function(task) {
    var self = this;
    var waiting = [];
    var rejected = [];

    task.dependsOn.forEach(function(dependencyId) {
        var dependency =
            self.tasks[dependencyId];
        var accepted =
            self.acceptedStates(
                task,
                dependencyId
            );

        if (!self.isTerminal(dependency.state)) {
            waiting.push(dependencyId);
            return;
        }

        if (
            accepted.indexOf(
                dependency.state
            ) < 0
        ) {
            rejected.push(dependencyId);
        }
    });

    return {
        waiting: waiting,
        rejected: rejected
    };
};

Coordinator.prototype.startTask = function(task) {
    var self = this;
    var attempt;
    var operationId;
    var completionSettled = false;
    var timeoutObserved = false;
    var returned;

    task.attempt += 1;
    attempt = task.attempt;
    operationId = this.nextOperationId;
    this.nextOperationId += 1;
    task.operationId = operationId;

    this.transition(
        task,
        "running"
    );

    function recordStale(state, reason) {
        self.record(
            "stale-task-completion",
            task.id,
            {
                attemptedState: state,
                attempt: attempt,
                operationId: operationId,
                currentOperationId:
                    task.operationId,
                reason: reason
            }
        );
    }

    function settle(state, details, source) {
        var recoverableStates = [
            "succeeded",
            "not-required",
            "degraded"
        ];

        if (task.operationId !== operationId) {
            recordStale(
                state,
                "operation-replaced"
            );
            return;
        }

        if (completionSettled) {
            recordStale(
                state,
                "already-settled"
            );
            return;
        }

        if (source === "timeout") {
            timeoutObserved = true;
            task.timer = null;

            self.transition(
                task,
                "timed-out",
                details
            );

            self.schedule();
            return;
        }

        if (timeoutObserved) {
            if (
                task.recoveryPolicy !==
                    "allow-late-success" ||
                recoverableStates.indexOf(state) < 0
            ) {
                recordStale(
                    state,
                    "late-result-rejected"
                );
                return;
            }

            completionSettled = true;

            self.transition(
                task,
                state,
                details
            );

            self.record(
                "task-recovered",
                task.id,
                {
                    operationId:
                        operationId,
                    fromState:
                        "timed-out",
                    toState:
                        state
                }
            );

            self.reconsiderBlockedTasks();
            self.schedule();
            return;
        }

        completionSettled = true;

        if (task.timer !== null) {
            clearTimeout(task.timer);
            task.timer = null;
        }

        self.transition(
            task,
            state,
            details
        );

        self.schedule();
    }

    if (
        task.timeoutMs !== null &&
        task.timeoutMs >= 0
    ) {
        task.timer = setTimeout(
            function() {
                settle(
                    "timed-out",
                    {
                        error:
                            "Task exceeded " +
                            task.timeoutMs +
                            " ms."
                    },
                    "timeout"
                );
            },
            task.timeoutMs
        );
    }

    if (!task.run) {
        settle(
            "succeeded",
            undefined,
            "completion"
        );
        return;
    }

    try {
        returned = task.run(
            this.context,
            {
                taskId: task.id,
                attempt: attempt,
                operationId:
                    operationId
            }
        );
    } catch (error) {
        settle(
            "failed",
            {
                error:
                    errorMessage(error)
            },
            "completion"
        );
        return;
    }

    Promise.resolve(returned).then(
        function(result) {
            var state = "succeeded";
            var value = result;

            if (
                result &&
                typeof result === "object" &&
                typeof result.state === "string"
            ) {
                state = result.state;
                value = result.value;
            }

            if (
                TERMINAL_STATES.indexOf(state) < 0
            ) {
                settle(
                    "failed",
                    {
                        error:
                            "Task returned unsupported state " +
                            state
                    },
                    "completion"
                );
                return;
            }

            settle(
                state,
                {
                    result: value
                },
                "completion"
            );
        },
        function(error) {
            settle(
                "failed",
                {
                    error:
                        errorMessage(error)
                },
                "completion"
            );
        }
    );
};

Coordinator.prototype.reconsiderBlockedTasks = function() {
    var self = this;
    var changed = true;

    while (changed) {
        changed = false;

        Object.keys(this.tasks).forEach(
            function(taskId) {
                var task =
                    self.tasks[taskId];
                var evaluation;

                if (task.state !== "blocked") {
                    return;
                }

                evaluation =
                    self.dependencyEvaluation(
                        task
                    );

                if (
                    evaluation.rejected.length === 0
                ) {
                    self.transition(
                        task,
                        "waiting",
                        {
                            blockedBy: []
                        }
                    );

                    self.record(
                        "task-unblocked",
                        task.id,
                        {
                            waitingFor:
                                evaluation.waiting
                        }
                    );

                    changed = true;
                }
            }
        );
    }

    return this;
};

Coordinator.prototype.schedule = function() {
    var self = this;
    var changed = true;

    while (changed) {
        changed = false;

        Object.keys(this.tasks).forEach(
            function(taskId) {
                var task =
                    self.tasks[taskId];
                var evaluation;

                if (
                    task.state !== "registered" &&
                    task.state !== "waiting"
                ) {
                    return;
                }

                evaluation =
                    self.dependencyEvaluation(
                        task
                    );

                if (
                    evaluation.rejected.length > 0
                ) {
                    self.transition(
                        task,
                        "blocked",
                        {
                            blockedBy:
                                evaluation.rejected
                        }
                    );
                    changed = true;
                    return;
                }

                if (
                    evaluation.waiting.length > 0
                ) {
                    if (
                        task.state !== "waiting"
                    ) {
                        self.transition(
                            task,
                            "waiting"
                        );
                        changed = true;
                    }
                    return;
                }

                self.startTask(task);
                changed = true;
            }
        );
    }

    return this;
};

Coordinator.prototype.start = function(context) {
    if (this.started) {
        this.record(
            "duplicate-start-ignored",
            null
        );
        return this;
    }

    this.validate();

    this.started = true;
    this.context = context || {};

    this.record(
        "coordinator-started",
        null
    );

    this.schedule();

    return this;
};

Coordinator.prototype.inspect = function() {
    var tasks = {};
    var self = this;

    Object.keys(this.tasks).forEach(function(taskId) {
        var task = self.tasks[taskId];

        tasks[taskId] = {
            id: task.id,
            dependsOn:
                task.dependsOn.slice(),
            accepts:
                copy(task.accepts),
            timeoutMs:
                task.timeoutMs,
            recoveryPolicy:
                task.recoveryPolicy,
            state:
                task.state,
            result:
                copy(task.result),
            error:
                task.error,
            blockedBy:
                task.blockedBy.slice(),
            attempt:
                task.attempt,
            operationId:
                task.operationId
        };
    });

    return {
        started: this.started,
        tasks: tasks,
        events: copy(this.events)
    };
};

module.exports = {
    create: function(options) {
        return new Coordinator(options);
    },
    terminalStates:
        TERMINAL_STATES.slice(),
    defaultAcceptedStates:
        DEFAULT_ACCEPTED_STATES.slice()
};
