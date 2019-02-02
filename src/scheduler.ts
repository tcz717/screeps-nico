import { Corps } from "corps";
import _ from "lodash";
import { Excutable, getTaskMemory, isAvailable, loadTask, setTaskMemory, Task } from "task";

export interface Scheduler {
    corpsMemory: CorpsMemory
    pushTask(memory: TaskMemory | (() => TaskMemory | null), maxCount?: number): void
    getTaskNumber(task: TaskMemory): number
    schedule(): void;
    shutdownTask(memory?: TaskMemory): void;
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
    pushTask(memory: TaskMemory | (() => TaskMemory | null), maxCount = 1): void {
        if (memory instanceof Function) {
            let m = memory();
            if (m == null)
                return;
            memory = m;
        }
        let count = memory.tag ? maxCount - this.getTaskNumber(memory) : 1;
        count = Math.floor(count);
        // console.log(memory.type, count, maxCount, this.getTaskNumber(memory));
        for (let i = 0; i < count; ++i)
            this.corpsMemory.taskQueue.push(memory);
        this.addTaskNumber(memory, count);
    }
    protected addTaskNumber(memory: TaskMemory, count: number) {
        if (memory.tag && count > 0) {
            _.update(this.corpsMemory.counter, [memory.type, memory.tag], old => (old || 0) + count);
        }
    }
    getTaskNumber(task: TaskMemory): number {
        return _.get(this.corpsMemory.counter, [task.type, task.tag || "unknown"], 0);
    }
    schedule(): void {
        this.checkReset();
        // 🆑清除无用的任务
        this.cleanTaskQueue();
        // 清除结束的任务
        this.cleanStopedTask();
        this.cleanTimeout();

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
                    const interruptedTask = getTaskMemory(excutor[0])!;
                    loadTask(interruptedTask).reset();
                    queue.push(interruptedTask);
                    console.log(`task ${interruptedTask.type} is interrupted by ${memory.type}`)
                }
            }
            if (excutor) {
                setTaskMemory(excutor[0], memory);
                task.assign(excutor[0]);
                queue[index] = undefined;
            }
        }
        this.corpsMemory.taskQueue = _.compact(queue);

        this.cleanCounter();
    }

    private cleanTimeout() {
        _.remove(this.corpsMemory.taskQueue, memory => memory.timeout && memory.timeout < Game.time).forEach(memory => {
            console.log(`task ${memory.type} timeout`);
            this.popTask(memory);
        });;
    }

    private findInterruptableExcutor(task: Task) {
        return _(this.corps.excutors)
            .filter(excutor => {
                const memory = getTaskMemory(excutor);
                if (!memory || !isAvailable(excutor))
                    return false;
                else {
                    return !memory.uninterruptible && memory.priority < task.memory.priority && memory.lastResult == TaskResult.Acceptable;
                }
            })
            .map(excutor => <[Excutable, Number]>[excutor, task.canExcute(excutor!)])
            .filter(tuple => tuple[1] > 0)
            .maxBy(1);
    }

    private findIdleExcutor(task: Task) {
        return _(this.corps.excutors)
            .filter(excutor => !getTaskMemory(excutor) && isAvailable(excutor))
            .map(excutor => <[Excutable, Number]>[excutor, task.canExcute(excutor)])
            .filter(tuple => tuple[1] > 0)
            .maxBy(1);
    }

    private cleanStopedTask() {
        this.corps.excutors.forEach(excutor => {
            const memory = getTaskMemory(excutor);
            if (memory && memory.lastResult && memory.lastResult != TaskResult.Working && memory.lastResult != TaskResult.Acceptable) {
                loadTask(memory).drop();
                this.popTask(memory);
                setTaskMemory(excutor);
            }
        });
    }

    private cleanTaskQueue() {
        _.remove(this.corpsMemory.taskQueue, task => loadTask(task).isFinished()).forEach(memory => {
            console.log(`detect task ${memory.type} is finished and omit it`);
            this.popTask(memory);
        });
    }

    private checkReset() {
        if (this.corpsMemory.reset) {
            _.forEach(this.corps.memory.taskQueue, this.popTask);
            this.corpsMemory.taskQueue = [];
            delete this.corpsMemory.reset;
            console.log(`RESET TASKQUEUE of ${this.corpsMemory.name}`)
        }
    }

    private cleanCounter() {
        for (const task in this.corpsMemory.counter) {
            this.corpsMemory.counter[task] = _.pickBy(this.corpsMemory.counter[task], _.identity);
        }
    }

    shutdownTask(memory?: TaskMemory) {
        if (memory) {
            this.popTask(memory);
            console.log(`shutdown ${memory.type} task`)
        }
    }
}