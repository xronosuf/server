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
        specification.external === true &&
        specification.run !== undefined
    ) {
        throw new Error(
            "External coordinator task " +
            specification.id +
            " may not define run."
        );
    }

    if (
        specification.timeoutDetails !== undefined &&
        typeof specification.timeoutDetails !==
            "function"
    ) {
        throw new Error(
            "timeoutDetails must be a function for task " +
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
        timeoutDetails:
            specification.timeoutDetails || null,
        recoveryPolicy:
            specification.recoveryPolicy ||
            "reject-late",
        external:
            specification.external === true,
        recomputeOnDependencyChange:
            specification.recomputeOnDependencyChange ===
                true,
        run: specification.run || null,
        state: "registered",
        result: undefined,
        error: null,
        lastTimeout: null,
        blockedBy: [],
        timer: null,
        attempt: 0,
        operationId: null,
        signalCount: 0,
        pendingSignal: null,
        dependencySignature: null
    };

    this.tasks[task.id] = task;

    this.record(
        "task-registered",
        task.id,
        {
            dependsOn: task.dependsOn,
            timeoutMs: task.timeoutMs,
            hasTimeoutDetails:
                task.timeoutDetails !== null,
            recoveryPolicy:
                task.recoveryPolicy,
            external:
                task.external,
            recomputeOnDependencyChange:
                task.recomputeOnDependencyChange
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

Coordinator.prototype.dependencySignature = function(task) {
    var self = this;

    return JSON.stringify(
        task.dependsOn.map(
            function(taskId) {
                return {
                    id: taskId,
                    state:
                        self.tasks[taskId]
                            ? self.tasks[taskId]
                                .state
                            : null,
                    operationId:
                        self.tasks[taskId]
                            ? self.tasks[taskId]
                                .operationId
                            : null
                };
            }
        )
    );
};

Coordinator.prototype.reconsiderDerivedTasks = function() {
    var self = this;
    var changed = false;
    var recomputableStates = [
        "degraded",
        "failed",
        "timed-out"
    ];

    Object.keys(this.tasks).forEach(
        function(taskId) {
            var task =
                self.tasks[taskId];
            var evaluation;
            var signature;

            if (
                !task.recomputeOnDependencyChange ||
                recomputableStates.indexOf(
                    task.state
                ) < 0
            ) {
                return;
            }

            evaluation =
                self.dependencyEvaluation(
                    task
                );

            if (
                evaluation.waiting.length > 0 ||
                evaluation.rejected.length > 0
            ) {
                return;
            }

            signature =
                self.dependencySignature(
                    task
                );

            if (
                signature ===
                task.dependencySignature
            ) {
                return;
            }

            self.transition(
                task,
                "waiting",
                {
                    recomputeReason:
                        "dependency-state-changed"
                }
            );

            self.record(
                "task-recompute-scheduled",
                task.id,
                {
                    previousDependencySignature:
                        task.dependencySignature,
                    nextDependencySignature:
                        signature
                }
            );

            changed = true;
        }
    );

    return changed;
};

Coordinator.prototype.timeoutTransitionDetails =
function(task, attempt, operationId) {
    var result = null;
    var details = {
        error:
            "Task exceeded " +
            task.timeoutMs +
            " ms."
    };

    if (task.timeoutDetails !== null) {
        try {
            result = task.timeoutDetails(
                this.context,
                {
                    taskId: task.id,
                    attempt: attempt,
                    operationId:
                        operationId,
                    timeoutMs:
                        task.timeoutMs
                }
            );
        } catch (error) {
            result = {
                timeoutDetailsError:
                    errorMessage(error)
            };

            this.record(
                "task-timeout-details-failed",
                task.id,
                {
                    attempt: attempt,
                    operationId:
                        operationId,
                    error:
                        errorMessage(error)
                }
            );
        }
    }

    if (result !== undefined && result !== null) {
        details.result = result;
    }

    task.lastTimeout = {
        attempt: attempt,
        operationId:
            operationId,
        timeoutMs:
            task.timeoutMs,
        error:
            details.error,
        result:
            copy(details.result)
    };

    return details;
};

Coordinator.prototype.startTask = function(task) {
    var self = this;
    var attempt;
    var operationId;
    var completionSettled = false;
    var timeoutObserved = false;
    var returned;

    task.dependencySignature =
        this.dependencySignature(task);

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
                {
                    result:
                        details &&
                        details.result !== undefined
                            ? details.result
                            : undefined,
                    error: null
                }
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
            self.reconsiderDerivedTasks();
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

        self.reconsiderDerivedTasks();
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
                    self.timeoutTransitionDetails(
                        task,
                        attempt,
                        operationId
                    ),
                    "timeout"
                );
            },
            task.timeoutMs
        );

        if (
            task.timer &&
            typeof task.timer.unref === "function"
        ) {
            task.timer.unref();
        }
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

Coordinator.prototype.armExternalTask = function(task) {
    var self = this;
    var operationId;

    if (
        task.state === "waiting" &&
        task.operationId !== null
    ) {
        return;
    }

    task.attempt += 1;
    operationId = this.nextOperationId;
    this.nextOperationId += 1;
    task.operationId = operationId;

    this.transition(
        task,
        "waiting"
    );

    this.record(
        "task-awaiting-signal",
        task.id,
        {
            operationId:
                operationId
        }
    );

    if (task.pendingSignal !== null) {
        var bufferedSignal =
            task.pendingSignal;

        task.pendingSignal = null;

        this.transition(
            task,
            bufferedSignal.state,
            {
                result:
                    bufferedSignal.value
            }
        );

        this.record(
            "task-buffered-signal-applied",
            task.id,
            {
                operationId:
                    operationId,
                state:
                    bufferedSignal.state
            }
        );

        return;
    }

    if (
        task.timeoutMs !== null &&
        task.timeoutMs >= 0
    ) {
        task.timer = setTimeout(
            function() {
                if (
                    task.operationId !==
                        operationId ||
                    task.state !== "waiting"
                ) {
                    return;
                }

                task.timer = null;

                self.transition(
                    task,
                    "timed-out",
                    self.timeoutTransitionDetails(
                        task,
                        task.attempt,
                        operationId
                    )
                );

                self.schedule();
            },
            task.timeoutMs
        );

        if (
            task.timer &&
            typeof task.timer.unref === "function"
        ) {
            task.timer.unref();
        }
    }
};

Coordinator.prototype.signal = function(
    taskId,
    state,
    value
) {
    var task = this.tasks[taskId];
    var recoverableStates = [
        "succeeded",
        "not-required",
        "degraded"
    ];

    if (!task) {
        throw new Error(
            "Unknown coordinator task: " +
            taskId
        );
    }

    if (!task.external) {
        throw new Error(
            "Coordinator task is not externally signaled: " +
            taskId
        );
    }

    if (
        TERMINAL_STATES.indexOf(state) < 0
    ) {
        throw new Error(
            "Unsupported external task state " +
            state +
            " for " +
            taskId
        );
    }

    task.signalCount += 1;

    if (
        task.operationId === null &&
        (
            task.state === "registered" ||
            task.state === "waiting"
        )
    ) {
        if (task.pendingSignal === null) {
            task.pendingSignal = {
                state: state,
                value: copy(value)
            };

            this.record(
                "task-signal-buffered",
                task.id,
                {
                    state: state,
                    reason:
                        "prerequisites-not-yet-satisfied"
                }
            );

            return true;
        }

        if (
            task.pendingSignal.state === state
        ) {
            this.record(
                "duplicate-task-signal-ignored",
                task.id,
                {
                    state: state,
                    buffered: true
                }
            );

            return false;
        }

        this.record(
            "conflicting-task-signal-ignored",
            task.id,
            {
                bufferedState:
                    task.pendingSignal.state,
                attemptedState:
                    state,
                reason:
                    "buffered-signal-already-present"
            }
        );

        return false;
    }

    if (task.state === state) {
        this.record(
            "duplicate-task-signal-ignored",
            task.id,
            {
                state: state,
                operationId:
                    task.operationId
            }
        );

        return false;
    }

    if (task.state === "timed-out") {
        if (
            task.recoveryPolicy !==
                "allow-late-success" ||
            recoverableStates.indexOf(state) < 0
        ) {
            this.record(
                "stale-task-completion",
                task.id,
                {
                    attemptedState:
                        state,
                    operationId:
                        task.operationId,
                    reason:
                        "late-external-signal-rejected"
                }
            );

            return false;
        }

        this.transition(
            task,
            state,
            {
                result: value,
                error: null
            }
        );

        this.record(
            "task-recovered",
            task.id,
            {
                operationId:
                    task.operationId,
                fromState:
                    "timed-out",
                toState:
                    state,
                source:
                    "external-signal"
            }
        );

        this.reconsiderBlockedTasks();
        this.reconsiderDerivedTasks();
        this.schedule();

        return true;
    }

    if (task.state !== "waiting") {
        this.record(
            "stale-task-completion",
            task.id,
            {
                attemptedState:
                    state,
                operationId:
                    task.operationId,
                reason:
                    "external-task-not-waiting"
            }
        );

        return false;
    }

    if (task.timer !== null) {
        clearTimeout(task.timer);
        task.timer = null;
    }

    this.transition(
        task,
        state,
        {
            result: value
        }
    );

    this.reconsiderDerivedTasks();
    this.schedule();

    return true;
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

                if (task.external) {
                    if (
                        task.state !== "waiting" ||
                        task.operationId === null
                    ) {
                        self.armExternalTask(
                            task
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
            hasTimeoutDetails:
                task.timeoutDetails !== null,
            recoveryPolicy:
                task.recoveryPolicy,
            external:
                task.external,
            recomputeOnDependencyChange:
                task.recomputeOnDependencyChange,
            state:
                task.state,
            result:
                copy(task.result),
            error:
                task.error,
            lastTimeout:
                copy(task.lastTimeout),
            blockedBy:
                task.blockedBy.slice(),
            attempt:
                task.attempt,
            operationId:
                task.operationId,
            signalCount:
                task.signalCount,
            pendingSignal:
                copy(task.pendingSignal),
            dependencySignature:
                task.dependencySignature
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
