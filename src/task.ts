
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
    isFinished(): boolean;
}
export class MoveTask implements Task {
    memory: MoveTaskMemory;
    excutor: Creep | null;
    pos: RoomPosition;
    static moveTo(pos: RoomPosition, excutor?: Creep, range: number = 1, priority = PRIORITY_NORMAL): MoveTask {
        const task = new MoveTask({
            type: TaskType.Move,
            pos: pos,
            range: range,
            priority: priority
        });
        if (excutor)
            task.assign(excutor);
        return task;
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
    reset(): void { }
    isFinished(): boolean {
        return this.excutor && this.excutor.pos.inRangeTo(this.pos, this.memory.range) || false;
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
            console.log("assigned " + this.memory.type + " to " + excutor.name)
            this.excutor = excutor;
            this.memory.excutorId = excutor.id;
        }
        else
            throw new Error("assign bug in " + typeof this);
    }
    canExcute(excutor: Excutable): number {
        if (excutor instanceof Creep) {
            const body = _.countBy(excutor.body, 'type');
            if (body[MOVE] == 0 || body[CARRY] == 0 || body[WORK] == 0)
                return 0;
            return body[MOVE] + body[CARRY] + body[WORK];
        }
        return 0;
    }
    excute(): TaskResult {
        if (this.excutor == null)
            return TaskResult.Fail;
        if (this.isFinished())
            return TaskResult.Finished;
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
    abstract isFinished(): boolean;
    reset(): void { this.memory.child = [] }
}

export class HarvestTask extends WorkTask {
    static harvest(pos: RoomPosition, resource: ResourceConstant, priority = PRIORITY_NORMAL, excutor?: Creep): HarvestTask {
        if (resource != RESOURCE_ENERGY)
            throw new Error("only energy implemented.");
        const task = new HarvestTask({
            type: TaskType.Harvest,
            priority: priority,
            targetId: pos.findClosestByPath(FIND_SOURCES)!.id
        });
        if (excutor)
            task.assign(excutor);
        return task
    }
    memory: HarvestTaskMemory;
    constructor(memory: TaskMemory) {
        super(memory);
        if (memory.type != TaskType.Harvest)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
    }
    mainAction(): TaskResult {
        const source = Game.getObjectById<Source>(this.memory.targetId);
        if (!source || !this.excutor)
            return TaskResult.Fatal;
        let result = this.excutor.harvest(source);
        if (result == OK) {
            if (this.excutor.carry.energy < this.excutor.carryCapacity)
                return TaskResult.Acceptable;
            else
                return TaskResult.Finished;
        }
        else if (result == ERR_NOT_IN_RANGE) {
            this.memory.child = [MoveTask.moveTo(source.pos, this.excutor).memory];
            return TaskResult.Working;
        }
        else
            return TaskResult.Fail;
    }
    isFinished(): boolean {
        return this.excutor && this.excutor.carry.energy == this.excutor.carryCapacity || false;
    }
}
export abstract class ResourceTask extends WorkTask {
    resource: ResourceConstant;
    constructor(memory: TaskMemory, resource: ResourceConstant = RESOURCE_ENERGY) {
        super(memory);
        this.resource = resource;
    }
    mainAction(): TaskResult {
        const target = Game.getObjectById<OwnedStructure>(this.memory.targetId);
        if (!target || !this.excutor)
            return TaskResult.Fatal;
        let result = this.useAction(target);
        if (!this.excutor.carry[this.resource]) {
            this.memory.child = [
                HarvestTask.harvest(this.excutor.pos, this.resource, this.memory.priority, this.excutor).memory
            ];
            return TaskResult.Working;
        }
        if (result == OK || result == ERR_FULL) {
            return TaskResult.Finished;
        }
        else if (result == ERR_NOT_ENOUGH_RESOURCES) {
            this.memory.child = [
                HarvestTask.harvest(this.excutor.pos, this.resource, this.memory.priority, this.excutor).memory
            ];
            return TaskResult.Working;
        }
        else if (result == ERR_NOT_IN_RANGE) {
            this.memory.child = [MoveTask.moveTo(target.pos, this.excutor).memory];
            return TaskResult.Working;
        }
        else
            return TaskResult.Fail;
    }
    abstract useAction(target: OwnedStructure<StructureConstant>): ScreepsReturnCode;
}
export class TransferTask extends WorkTask {
    memory: TransferTaskMemory;
    constructor(memory: TaskMemory) {
        super(memory);
        if (memory.type != TaskType.Transfer)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
    }
    mainAction(): TaskResult {
        const target = Game.getObjectById<OwnedStructure>(this.memory.targetId);
        if (!target || !this.excutor)
            return TaskResult.Fatal;
        let result = this.excutor.transfer(target, this.memory.resource);
        if (!this.excutor.carry[this.memory.resource]) {
            this.memory.child = [
                HarvestTask.harvest(this.excutor.pos, this.memory.resource, this.memory.priority, this.excutor).memory
            ];
            return TaskResult.Working;
        }
        if (result == OK || result == ERR_FULL) {
            return TaskResult.Finished;
        }
        else if (result == ERR_NOT_ENOUGH_RESOURCES) {
            this.memory.child = [
                HarvestTask.harvest(this.excutor.pos, this.memory.resource, this.memory.priority, this.excutor).memory
            ];
            return TaskResult.Working;
        }
        else if (result == ERR_NOT_IN_RANGE) {
            this.memory.child = [MoveTask.moveTo(target.pos, this.excutor).memory];
            return TaskResult.Working;
        }
        else
            return TaskResult.Fail;
    }
    isFinished(): boolean {
        const target = Game.getObjectById<OwnedStructure>(this.memory.targetId);
        if (target instanceof StructureExtension || target instanceof StructureSpawn)
            return target && target.energy == target.energyCapacity || false;
        return false;
    }
}

export class UpgradeControllerTask extends WorkTask {
    memory: UpgradeControllerTaskMemory;
    constructor(memory: TaskMemory) {
        super(memory);
        if (memory.type != TaskType.UpgradeController)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
    }
    mainAction(): TaskResult {
        throw new Error("Method not implemented.");
    }
    isFinished(): boolean {
        throw new Error("Method not implemented.");
    }
}

const FindTask = {
    [TaskType.Move]: MoveTask,
    [TaskType.Harvest]: HarvestTask,
    [TaskType.Transfer]: TransferTask,
    [TaskType.UpgradeController]: UpgradeControllerTask,
};
export function loadTask(memory: TaskMemory): Task {
    return new FindTask[memory.type](memory);
}