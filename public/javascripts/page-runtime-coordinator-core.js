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
        run: specification.run || null,
        state: "registered",
        result: undefined,
        error: null,
        blockedBy: [],
        timer: null,
        attempt: 0
    };

    this.tasks[task.id] = task;

    this.record(
        "task-registered",
        task.id,
        {
            dependsOn: task.dependsOn,
            timeoutMs: task.timeoutMs
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
    var settled = false;
    var returned;

    task.attempt += 1;
    attempt = task.attempt;

    this.transition(
        task,
        "running"
    );

    function settle(state, details) {
        if (settled) {
            self.record(
                "stale-task-completion",
                task.id,
                {
                    attemptedState: state,
                    attempt: attempt
                }
            );
            return;
        }

        settled = true;

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
                    }
                );
            },
            task.timeoutMs
        );
    }

    if (!task.run) {
        settle("succeeded");
        return;
    }

    try {
        returned = task.run(
            this.context,
            {
                taskId: task.id,
                attempt: attempt
            }
        );
    } catch (error) {
        settle(
            "failed",
            {
                error:
                    errorMessage(error)
            }
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
                    }
                );
                return;
            }

            settle(
                state,
                {
                    result: value
                }
            );
        },
        function(error) {
            settle(
                "failed",
                {
                    error:
                        errorMessage(error)
                }
            );
        }
    );
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
            state:
                task.state,
            result:
                copy(task.result),
            error:
                task.error,
            blockedBy:
                task.blockedBy.slice(),
            attempt:
                task.attempt
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
