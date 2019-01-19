
import _ from "lodash"
export type Excutable = Creep | StructureSpawn;

export const PRIORITY_UNINTERRUPTIBLE = 3000;
export const PRIORITY_HIGH = 1500;
export const PRIORITY_NORMAL = 1000;
export const PRIORITY_LOW = 500;

// export enum TaskResult {
//     /** 已完成 */
//     Finished,
//     /** 尚未完成 */
//     Working,
//     /** 失败，当任务仍然可以分配给其他执行者 */
//     Fail,
//     /** 失败，且不可继续 */
//     Fatal,
//     /** 尚未完成，但是可以被移交或暂停 */
//     Acceptable,
// }

export interface Task {
    memory: TaskMemory;
    /** 分配给一个执行者 */
    assign(excutor: Excutable): void;
    /** 检测执行者能否负责此任务并返回能力值，0表示不可执行 */
    canExcute(excutor: Excutable): number;
    /** 执行任务 并返回结果 */
    excute(): TaskResult;
    /** 重置任务 */
    reset(): void;
    /** 检测任务是否已经完成， 用于优化 */
    isFinished(): boolean;
    /** 用于处理任务结束的收尾 */
    drop(result: TaskResult): void;
}
/** 移动任务 */
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
            this.memory.startTick = Game.time;
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
                return this.memory.lastResult = TaskResult.Finished;
            const result = this.excutor.moveTo(this.pos);
            if (result == OK || result == ERR_TIRED)
                return this.memory.lastResult = TaskResult.Working;
            console.log(this.pos, result);
        }

        return this.memory.lastResult = TaskResult.Fatal;
    }
    reset(): void { }
    drop(result: TaskResult): void { }
    isFinished(): boolean {
        return this.excutor && this.excutor.pos.inRangeTo(this.pos, this.memory.range) || false;
    }
}
/** 需要WORK，CARRY和MOVE三个组件完成的任务 */
abstract class WorkTask implements Task {
    memory: TaskMemory;
    excutor: Creep | null;
    emoji?: string;
    constructor(memory: TaskMemory) {
        this.memory = memory;
        this.excutor = Game.getObjectById(memory.excutorId);
    }
    assign(excutor: Excutable): void {
        if (excutor instanceof Creep) {
            console.log("assigned " + this.memory.type + " to " + excutor.name)
            this.excutor = excutor;
            this.memory.excutorId = excutor.id;
            this.memory.startTick = Game.time;
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
            return this.memory.lastResult = TaskResult.Fail;
        if (this.isFinished())
            return this.memory.lastResult = TaskResult.Finished;
        if (this.memory.child && this.memory.child.length) {
            const task = loadTask(this.memory.child[0]);
            let result = task.excute();
            if (result == TaskResult.Finished) {
                this.memory.child.shift();
                task.drop(result);
                return this.memory.lastResult = TaskResult.Working;
            }
            return this.memory.lastResult = result;
        }
        else {
            if (this.emoji)
                this.excutor.say(this.emoji);
            return this.memory.lastResult = this.mainAction();
        }
    }
    abstract mainAction(): TaskResult;
    abstract isFinished(): boolean;
    drop(result: TaskResult): void {
        console.log(`drop task ${this.memory.type} of ${this.excutor && this.excutor.id || 'N/A'} because ${result} in ${this.memory.startTick && Game.time - this.memory.startTick || 'N/A'}`);
        _.forEach(this.memory.child, memory => loadTask(memory).drop(result));
    }
    reset(): void { this.memory.child = [] }
}
/** 采集任务 */
export class HarvestTask extends WorkTask {
    emoji = "⛏";
    static harvest(pos: RoomPosition, resource: ResourceConstant, priority = PRIORITY_NORMAL, excutor?: Creep): HarvestTask {
        if (resource != RESOURCE_ENERGY)
            throw new Error("only energy implemented.");
        const sourceDuration = Game.rooms[pos.roomName].memory.sources;
        const task = new HarvestTask({
            type: TaskType.Harvest,
            priority: priority,
            targetId: _.minBy(_.keys(sourceDuration), id => sourceDuration[id]),
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
            if (!this.memory.reachTick)
                this.memory.reachTick = Game.time;
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
            return TaskResult.Fatal;
    }
    isFinished(): boolean {
        return this.excutor && this.excutor.carry.energy == this.excutor.carryCapacity || false;
    }
    drop(result: TaskResult): void {
        super.drop(result);
        const source = Game.getObjectById<Source>(this.memory.targetId);
        if (this.memory.startTick && source) {
            const duration = this.memory.reachTick ? this.memory.reachTick - this.memory.startTick : 1000;
            source.room.memory.sources[source.id] += 0.3 * (duration - source.room.memory.sources[source.id]);
        }
    }
}
/** 需要采集资源并消耗的任务 */
export abstract class ResourceTask extends WorkTask {
    resource: ResourceConstant;
    range = 1;
    errorTofinish: ScreepsReturnCode = ERR_FULL;
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
        if (result == this.errorTofinish)
            return TaskResult.Finished;
        else if (result == OK)
            return TaskResult.Acceptable;
        else if (result == ERR_NOT_ENOUGH_RESOURCES) {
            this.memory.child = [
                HarvestTask.harvest(this.excutor.pos, this.resource, this.memory.priority, this.excutor).memory
            ];
            return TaskResult.Working;
        }
        else if (result == ERR_NOT_IN_RANGE) {
            this.memory.child = [MoveTask.moveTo(target.pos, this.excutor, this.range).memory];
            return TaskResult.Working;
        }
        else
            return TaskResult.Fail;
    }
    abstract useAction(target: RoomObject): ScreepsReturnCode;
}
/** 转移资源任务 */
export class TransferTask extends ResourceTask {
    memory: TransferTaskMemory;
    constructor(memory: TaskMemory) {
        if (memory.type != TaskType.Transfer)
            throw new Error("task load bug in TransferTask");
        super(memory, memory.resource);
        this.memory = memory;
        this.emoji = "⛽";
    }
    useAction(target: RoomObject): ScreepsReturnCode {
        return this.excutor!.transfer(<OwnedStructure<StructureConstant>>target, this.memory.resource);
    }
    isFinished(): boolean {
        const target = Game.getObjectById<OwnedStructure>(this.memory.targetId);
        if (target instanceof StructureExtension || target instanceof StructureSpawn)
            return target && target.energy == target.energyCapacity || false;
        return false;
    }
}
/** 控制器升级任务 */
export class UpgradeControllerTask extends ResourceTask {
    memory: UpgradeControllerTaskMemory;
    constructor(memory: TaskMemory) {
        super(memory);
        if (memory.type != TaskType.UpgradeController)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
        this.range = 3;
        this.emoji = "🆙";
    }
    useAction(target: RoomObject): ScreepsReturnCode {
        return this.excutor!.upgradeController(<StructureController>target);
    }
    isFinished(): boolean {
        const controller = Game.getObjectById<StructureController>(this.memory.targetId);
        return !controller
            || (this.memory.level && controller.level >= this.memory.level)
            || (!this.memory.level && controller.ticksToDowngrade > 8000);
    }
}
/** 建造任务 */
export class BuildTask extends ResourceTask {
    memory: BuildTaskMemory;
    constructor(memory: TaskMemory) {
        super(memory);
        if (memory.type != TaskType.Build)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
        this.range = 3;
        this.emoji = "🏗";
    }
    useAction(target: RoomObject): ScreepsReturnCode {
        return this.excutor!.build(<ConstructionSite>target);
    }
    isFinished(): boolean {
        return Game.getObjectById<ConstructionSite>(this.memory.targetId) == null;
    }
}
/** 修理任务 */
export class RepairTask extends ResourceTask {
    memory: RepairTaskMemory;
    constructor(memory: TaskMemory) {
        super(memory);
        if (memory.type != TaskType.Repair)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
        this.range = 3;
        this.emoji = "🔧";
    }
    useAction(target: RoomObject): ScreepsReturnCode {
        return this.excutor!.repair(<Structure>target);
    }
    isFinished(): boolean {
        const struct = Game.getObjectById<Structure>(this.memory.targetId);
        return !struct || struct.hits == struct.hitsMax;
    }
}

const FindTask = {
    [TaskType.Move]: MoveTask,
    [TaskType.Harvest]: HarvestTask,
    [TaskType.Transfer]: TransferTask,
    [TaskType.UpgradeController]: UpgradeControllerTask,
    [TaskType.Build]: BuildTask,
    [TaskType.Repair]: RepairTask,
};
/** 根据memory创建任务实例  */
export function loadTask(memory: TaskMemory): Task {
    return new FindTask[memory.type](memory);
}