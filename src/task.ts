
export type Excutable = Creep | StructureSpawn;

export const PRIORITY_NORMAL = 1000;

export enum TaskResult {
    Finished,
    Working,
    Fail,
    Fatal,
    Acceptable,
}

export interface Task {
    memory: TaskMemory;
    assign(excutor: Excutable): void;
    canExcute(excutor: Excutable): number;
    excute(): TaskResult;
    reset(): void;
}
export class MoveTask implements Task {
    memory: MoveTaskMemory;
    excutor: Creep | null;
    pos: RoomPosition;
    static moveTo(pos: RoomPosition, range: number = 1, priority = PRIORITY_NORMAL): MoveTask {
        return new MoveTask({
            type: TaskType.Move,
            pos: pos,
            range: range,
            priority: priority
        })
    }
    constructor(memory: TaskMemory) {
        if (memory.type != TaskType.Move)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
        this.excutor = Game.getObjectById(memory.excutorId);
        this.pos = new RoomPosition(memory.pos.x, memory.pos.y, memory.pos.roomName);
    }
    assign(excutor: Excutable): void {
        if (excutor instanceof Creep) {
            this.excutor = excutor;
            this.memory.excutorId = excutor.id;
        }
        else
            throw new Error("assign bug in " + typeof this);
    }
    canExcute(excutor: Excutable): number {
        if (excutor instanceof Creep) {
            return excutor.body.filter(body => body.type == MOVE).length;
        }
        return 0;
    }
    excute(): TaskResult {
        if (this.excutor) {
            if (this.excutor.pos.inRangeTo(this.pos, this.memory.range))
                return TaskResult.Finished;
            const result = this.excutor.moveTo(this.pos);
            if (result == OK || result == ERR_TIRED)
                return TaskResult.Working;
            console.log(this.pos, result);
        }

        return TaskResult.Fatal;
    }
    reset(): void {

    }
}

abstract class WorkTask implements Task {
    memory: TaskMemory;
    excutor: Creep | null;
    constructor(memory: TaskMemory) {
        this.memory = memory;
        this.excutor = Game.getObjectById(memory.excutorId);
    }
    assign(excutor: Excutable): void {
        if (excutor instanceof Creep) {
            console.log("assigned " + typeof this + " to " + excutor.name)
            this.excutor = excutor;
            this.memory.excutorId = excutor.id;
        }
        else
            throw new Error("assign bug in " + typeof this);
    }
    canExcute(excutor: Excutable): number {
        if (excutor instanceof Creep) {
            const body = _.countBy(excutor.body, 'type');
            if (body[MOVE] == 0 || body[CARRY] == 0 || body[WORK] == 0 || excutor.carry.energy == excutor.carryCapacity)
                return 0;
            return body[MOVE] + body[CARRY] + body[WORK];
        }
        return 0;
    }
    excute(): TaskResult {
        if (this.excutor == null)
            return TaskResult.Fail;
        if (this.memory.child && this.memory.child.length) {
            let result = loadTask(this.memory.child[0]).excute();
            if (result == TaskResult.Finished) {
                this.memory.child.shift();
                return TaskResult.Working;
            }
            return result;
        }
        else {
            return this.mainAction();
        }
    }
    abstract mainAction(): TaskResult;
    abstract reset(): void;
}

export class HarvestTask implements Task {
    memory: HarvestTaskMemory;
    excutor: Creep | null;
    constructor(memory: TaskMemory) {
        if (memory.type != TaskType.Harvest)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
        this.excutor = Game.getObjectById(memory.excutorId);
    }
    assign(excutor: Excutable): void {
        if (excutor instanceof Creep) {
            console.log("assigned HarvestTask to " + excutor.name)
            this.excutor = excutor;
            this.memory.excutorId = excutor.id;
        }
        else
            throw new Error("assign bug in " + typeof this);
    }
    canExcute(excutor: Excutable): number {
        if (excutor instanceof Creep) {
            const body = _.countBy(excutor.body, 'type');
            if (body[MOVE] == 0 || body[CARRY] == 0 || body[WORK] == 0 || excutor.carry.energy == excutor.carryCapacity)
                return 0;
            return body[MOVE] + body[CARRY] + body[WORK];
        }
        return 0;
    }
    excute(): TaskResult {
        if (this.excutor == null)
            return TaskResult.Fail;
        if (this.memory.child && this.memory.child.length) {
            let result = loadTask(this.memory.child[0]).excute();
            if (result == TaskResult.Finished) {
                this.memory.child.shift();
                return TaskResult.Working;
            }
            return result;
        }
        else {
            const source = Game.getObjectById<Source>(this.memory.targetId);
            if (!source)
                return TaskResult.Fatal;
            let result = this.excutor.harvest(source);
            if (result == OK) {
                if (this.excutor.carry.energy < this.excutor.carryCapacity)
                    return TaskResult.Acceptable;
                else
                    return TaskResult.Finished;
            }
            else if (result == ERR_NOT_IN_RANGE) {
                let move = MoveTask.moveTo(source.pos);
                move.assign(this.excutor);
                this.memory.child = [move.memory];
                return TaskResult.Working;
            }
            else
                return TaskResult.Fail;
        }
    }
    reset(): void {
    }
}

const FindTask = {
    [TaskType.Move]: MoveTask,
    [TaskType.Harvest]: HarvestTask,
};
export function loadTask(memory: TaskMemory): Task {
    return new FindTask[memory.type](memory);
}