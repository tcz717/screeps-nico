import _ from "lodash";
import { loadTask, Excutable } from "task";
import { Corps } from "corps";

export interface Scheduler {
    corpsMemory: CorpsMemory
    pushTask(memory: TaskMemory, maxCount?: number): void
    getTaskNumber(task: TaskMemory): number
    schedule(): void;
}

export class PrioritySchduler implements Scheduler {
    corpsMemory: CorpsMemory;
    room: Room;
    corps: Corps;
    constructor(corps: Corps) {
        this.corps = corps;
        this.corpsMemory = corps.memory;
        this.room = Game.rooms[corps.baseRoom.name];
    }
    popTask(memory: TaskMemory): void {
        if (memory.tag)
            this.corpsMemory.counter[memory.type][memory.tag] -= 1;
    }
    pushTask(memory: TaskMemory, maxCount?: number | undefined): void {
        const count = maxCount && memory.tag ? maxCount - this.getTaskNumber(memory) : 1;
        for (let i = 0; i < count; ++i)
            this.corpsMemory.taskQueue.push(memory);
        if (memory.tag && count > 0) {
            _.set(this.corpsMemory.counter, [memory.type, memory.tag],
                this.getTaskNumber(memory) + count);
        }
    }
    getTaskNumber(task: TaskMemory): number {
        return _.get(this.corpsMemory.counter, [task.type, task.tag || "unknown"], 0);
    }
    schedule(): void {
        // 🆑清除无用的任务
        this.cleanTaskQueue();
        // 清除结束的任务
        this.cleanStopedTask();
        this.cleanDiedExcutor();
        let queue: (TaskMemory | undefined)[] = _.orderBy(this.corpsMemory.taskQueue, "priority", "desc");
        for (let index = 0; index < queue.length; index++) {
            const memory = queue[index];
            if (!memory)
                break;
            let task = loadTask(memory);
            let excutor = this.findIdleExcutor(task);
            if (!excutor) {
                excutor = this.findInterruptableExcutor(task);
                if (excutor) {
                    const interruptedTask = excutor[0].memory.task!;
                    loadTask(interruptedTask).reset();
                    queue.push(interruptedTask);
                    console.log(`task ${interruptedTask.type} is interrupted by ${memory.type}`)
                }
            }
            if (excutor) {
                excutor[0].memory.task = memory;
                task.assign(excutor[0]);
                queue[index] = undefined;
            }
        }
        this.corpsMemory.taskQueue = _.compact(queue);
    }

    private findInterruptableExcutor(task: import("task").Task) {
        return _(this.corps.excutors)
            .filter(excutor => {
                if (excutor.spawning)
                    return false;
                if (!excutor.memory.task)
                    return false;
                else {
                    const memory = excutor.memory.task;
                    return !memory.uninterruptible && memory.priority < task.memory.priority && memory.lastResult == TaskResult.Acceptable;
                }
            })
            .map(excutor => <[Excutable, Number]>[excutor, task.canExcute(excutor!)])
            .filter(tuple => tuple[1] > 0)
            .maxBy(1);
    }

    private findIdleExcutor(task: import("task").Task) {
        return _(this.corps.excutors)
            .filter(excutpr => !excutpr.memory.task && !excutpr.spawning)
            .map(excutor => <[Excutable, Number]>[excutor, task.canExcute(excutor)])
            .filter(tuple => tuple[1] > 0)
            .maxBy(1);
    }

    private cleanStopedTask() {
        this.corps.excutors.forEach(excutor => {
            if (excutor.memory.task && excutor.memory.task.lastResult && excutor.memory.task.lastResult != TaskResult.Working && excutor.memory.task.lastResult != TaskResult.Acceptable) {
                loadTask(excutor.memory.task!).drop();
                this.popTask(excutor.memory.task!);
                delete excutor.memory.task;
            }
        });
    }

    private cleanTaskQueue() {
        _.remove(this.corpsMemory.taskQueue, task => loadTask(task).isFinished()).forEach(memory => {
            console.log(`detect task ${memory.type} is finished and omit it`);
            this.popTask(memory);
        });
    }

    private cleanDiedExcutor() {
        for (const name in this.corpsMemory.creeps) {
            if (!(name in Memory.creeps))
                continue;
            const task = Memory.creeps[name].task;
            if (!(name in Game.creeps) && task) {
                this.popTask(task);
            }
        }

        for (const name in this.corpsMemory.spawns) {
            if (!(name in Memory.spawns))
                continue;
            const task = Memory.spawns[name].task;
            if (!(name in Game.spawns) && task) {
                this.popTask(task);
            }
        }
    }
}