
import { AI_CONFIG } from "config";
import _ from "lodash";
export type Excutable = Creep | StructureSpawn;
type Worker = Creep | StructureTower;

export const PRIORITY_HIGH = 1500;
export const PRIORITY_NORMAL = 1000;
export const PRIORITY_LOW = 500;

export type EnergyContainer = StructureExtension | StructureSpawn | StructureTower;

export function isEnergyContainer(target: Structure | null): target is EnergyContainer {
    const energyRequired: string[] = [STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER];
    return target && energyRequired.includes(target.structureType) || false;
}
export function isStorage(target: Structure | null): target is StructureContainer | StructureStorage {
    return target instanceof StructureContainer || target instanceof StructureStorage;
}
function checkSource(sourceId: string) {
    return Game.getObjectById<Source>(sourceId)!.energy > 0;
}
export function isStorable(struct: Structure | null): struct is StructureContainer | StructureStorage {
    return (struct instanceof StructureContainer || struct instanceof StructureStorage)
        && _(struct.store).values().sum() < struct.storeCapacity;
}
export function isLoadable(struct: Structure | null, resource: ResourceConstant): boolean {
    return _.get(struct, ["store", resource], 0) > 0;
}
export function isCreeepFull(excutor?: Excutable): boolean {
    return excutor && excutor instanceof Creep && excutor.carry.energy == excutor.carryCapacity || false;
}

export abstract class Task {
    memory: TaskMemory;
    constructor(memory: TaskMemory) {
        this.memory = memory;
    }
    /** 分配给一个执行者 */
    assign(excutor: Excutable): void { this.memory.startTick = Game.time; }
    /** 检测执行者能否负责此任务并返回能力值，0表示不可执行 */
    abstract canExcute(excutor: Excutable): number;
    /** 执行任务 并返回结果 */
    abstract excute(excutor: Excutable): TaskResult;
    /** 重置任务 */
    reset(): void { this.memory.lastResult = undefined };
    /** 检测任务是否已经完成， 用于优化 */
    abstract isFinished(excutor?: Excutable): boolean;
    /** 用于处理任务结束的收尾 */
    drop(): void {
        console.log(`task ${this.memory.type} ${this.memory.lastResult} in ${this.memory.startTick && Game.time - this.memory.startTick || 'N/A'} ticks`);
    }
}

/** 移动任务 */
export class MoveTask extends Task {
    memory: MoveTaskMemory;
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
        super(memory);
        if (memory.type != TaskType.Move)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
        this.pos = new RoomPosition(memory.pos.x, memory.pos.y, memory.pos.roomName);
    }
    canExcute(excutor: Excutable): number {
        if (excutor instanceof Creep) {
            return excutor.body.filter(body => body.type == MOVE).length;
        }
        return 0;
    }
    excute(excutor: Excutable): TaskResult {
        if (excutor instanceof Creep) {
            if (excutor.pos.inRangeTo(this.pos, this.memory.range))
                return this.memory.lastResult = TaskResult.Finished;
            const result = excutor.moveTo(this.pos);
            if (result == OK || result == ERR_TIRED)
                return this.memory.lastResult = TaskResult.Working;
            excutor.say("😵");
        }

        return this.memory.lastResult = TaskResult.Fatal;
    }
    drop(): void { }
    isFinished(excutor?: Excutable): boolean {
        return excutor && excutor.pos.inRangeTo(this.pos, this.memory.range) || false;
    }
}
export class SpawnCreepTask extends Task {
    memory: SpawnCreepTaskMemory;
    cost: number;
    constructor(memory: TaskMemory) {
        super(memory);
        if (memory.type != TaskType.SpawnCreep)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
        this.cost = _.sumBy(memory.body, body => BODYPART_COST[body]);
    }
    assign(excutor: Excutable): void {
        super.assign(excutor);
        console.log(`start spawn ${this.memory.role} with ${this.memory.body.join(', ')}`)
    }
    canExcute(excutor: Excutable): number {
        if (!(this.memory.corps in Memory.corps))
            throw `corps ${this.memory.corps} not exsist`;

        if (!(excutor instanceof StructureSpawn))
            return 0;
        if (excutor.spawnCreep(this.memory.body, "FACKNAME", { dryRun: true }) != OK)
            return 0;
        return excutor.room.energyAvailable;
    }
    excute(excutor: Excutable): TaskResult {
        if (!(excutor instanceof StructureSpawn))
            return this.memory.lastResult = TaskResult.Fail;
        if (!this.memory.name) {
            const name = this.memory.corps + this.memory.role + Game.time;
            const result = excutor.spawnCreep(this.memory.body, name, {
                memory: {
                    role: this.memory.role
                }
            });
            if (result != OK)
                return this.memory.lastResult = TaskResult.Fail;
            this.memory.name = name;
            Memory.corps[this.memory.corps].creeps.push(name);
            return this.memory.lastResult = TaskResult.Working;
        }
        else {
            if (this.isFinished())
                return this.memory.lastResult = TaskResult.Finished;
            else if (excutor.spawning && excutor.spawning.name == this.memory.name)
                return this.memory.lastResult = TaskResult.Working;
            else
                return this.memory.lastResult = TaskResult.Fail;
        }
    }
    isFinished(excutor?: Excutable): boolean {
        if (!this.memory.name)
            return false;
        if (!(this.memory.name in Game.creeps))
            return false;
        if (Game.creeps[this.memory.name].spawning)
            return false;
        return true;
    }
    drop(): void {
        console.log(`task ${this.memory.type} ${this.memory.lastResult} for ${this.memory.name || 'N/A'}`);
    }
}
/** 需要WORK，CARRY和MOVE三个组件完成的任务 */
abstract class WorkTask extends Task {
    emoji?: string;
    only: Role;
    constructor(memory: TaskMemory) {
        super(memory);
        this.only = _.defaultTo(memory.only, Role.Worker);
    }
    assign(excutor: Excutable): void {
        if (excutor instanceof Creep) {
            console.log("assigned " + this.memory.type + " to " + excutor.name)
            super.assign(excutor);
        }
        else
            throw new Error("assign bug in " + typeof this);
    }
    canExcute(excutor: Excutable): number {
        if (!(excutor instanceof Creep))
            return 0;
        if (!this.checkRole(excutor))
            return 0;
        const body = _(excutor.body).countBy('type').pick([WORK, CARRY, MOVE]);
        if (body.values().some(_.negate(_.identity)))
            return 0;
        return body.values().sum();
    }
    protected checkRole(excutor: Creep) {
        return excutor.memory.role == this.only;
    }
    excute(excutor: Excutable): TaskResult {
        if (excutor == null || !(excutor instanceof Creep || excutor instanceof StructureTower))
            return this.memory.lastResult = TaskResult.Fail;
        if (this.isFinished(excutor))
            return this.memory.lastResult = TaskResult.Finished;
        if (this.memory.child && this.memory.child.length) {
            const task = loadTask(this.memory.child[0]);
            let result = task.excute(excutor);
            if (result == TaskResult.Finished) {
                this.memory.child.shift();
                task.drop();
                return this.memory.lastResult = TaskResult.Working;
            }
            return this.memory.lastResult = result;
        }
        else {
            if (this.emoji && excutor instanceof Creep)
                excutor.say(this.emoji);
            return this.memory.lastResult = this.mainAction(excutor);
        }
    }
    abstract mainAction(excutor: Worker): TaskResult;
    abstract isFinished(excutor?: Excutable): boolean;
    drop(): void {
        super.drop();
        _.forEach(this.memory.child, memory => loadTask(memory).drop());
    }
    reset(): void { super.reset(); this.memory.child = [] }
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
            targetId: _.minBy(_.keys(sourceDuration), id => sourceDuration[id])!,
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
    mainAction(excutor: Worker): TaskResult {
        const source = Game.getObjectById<Source>(this.memory.targetId);
        if (!source || excutor instanceof StructureTower)
            return TaskResult.Fatal;
        let result = excutor.harvest(source);
        if (result == OK) {
            if (!this.memory.reachTick)
                this.memory.reachTick = Game.time;
            if (excutor.carry.energy < excutor.carryCapacity)
                return TaskResult.Acceptable;
            else
                return TaskResult.Finished;
        }
        else if (result == ERR_NOT_IN_RANGE) {
            this.memory.child = [MoveTask.moveTo(source.pos, excutor).memory];
            return TaskResult.Working;
        }
        else
            return TaskResult.Fatal;
    }
    isFinished(excutor?: Excutable): boolean {
        return isCreeepFull(excutor);
    }
    drop(): void {
        super.drop();
        const source = Game.getObjectById<Source>(this.memory.targetId);
        if (this.memory.startTick && source) {
            const duration = this.memory.reachTick ? this.memory.reachTick - this.memory.startTick : 1000;
            source.room.memory.sources[source.id] += AI_CONFIG.sourceLearningRate * (duration - source.room.memory.sources[source.id]);
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
    mainAction(excutor: Worker): TaskResult {
        const target = Game.getObjectById<OwnedStructure>(this.memory.targetId);
        if (!target || excutor instanceof StructureTower)
            return TaskResult.Fatal;
        let result = this.useAction(excutor, target);
        if (!excutor.carry[this.resource]) {
            this.memory.child = [this.getResourceTask(excutor)];
            return TaskResult.Acceptable;
        }
        if (result == this.errorTofinish)
            return TaskResult.Finished;
        else if (result == OK)
            return TaskResult.Working;
        else if (result == ERR_NOT_ENOUGH_RESOURCES) {
            this.memory.child = [this.getResourceTask(excutor)];
            return TaskResult.Acceptable;
        }
        else if (result == ERR_NOT_IN_RANGE) {
            this.memory.child = [MoveTask.moveTo(target.pos, excutor, this.range).memory];
            return TaskResult.Acceptable;
        }
        else
            return TaskResult.Fail;
    }
    protected getResourceTask(excutor: Creep): TaskMemory {
        const storage = excutor.pos.findClosestByPath(FIND_STRUCTURES, { filter: s => isLoadable(s, this.resource) });
        if (storage) {
            return {
                type: TaskType.Load,
                priority: PRIORITY_NORMAL,
                targetId: storage.id,
                resource: this.resource,
                startTick: Game.time,
            }
        }
        return HarvestTask.harvest(excutor.pos, this.resource, this.memory.priority, excutor).memory;
    }

    abstract useAction(excutor: Creep, target: RoomObject): ScreepsReturnCode;
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
    useAction(excutor: Creep, target: RoomObject): ScreepsReturnCode {
        return excutor.transfer(<OwnedStructure<StructureConstant>>target, this.memory.resource);
    }
    isFinished(): boolean {
        const target = Game.getObjectById<OwnedStructure>(this.memory.targetId);
        if (target instanceof StructureExtension || target instanceof StructureSpawn)
            return target && target.energy == target.energyCapacity || false;
        return false;
    }
}
/** 装载资源任务 */
export class LoadTask extends WorkTask {
    memory: LoadTaskMemory;
    constructor(memory: TaskMemory) {
        if (memory.type != TaskType.Load)
            throw new Error("task load bug in TransferTask");
        super(memory);
        this.memory = memory;
        this.emoji = "⏫";
    }
    mainAction(excutor: Worker): TaskResult {
        const target = Game.getObjectById<Structure>(this.memory.targetId);
        if (!target || excutor instanceof StructureTower)
            return TaskResult.Fatal;
        const result = excutor.withdraw(target, this.memory.resource);
        if (result == OK || result == ERR_FULL) {
            if (excutor.carry.energy < excutor.carryCapacity)
                return TaskResult.Acceptable;
            else
                return TaskResult.Finished;
        }
        else if (result == ERR_NOT_IN_RANGE) {
            this.memory.child = [MoveTask.moveTo(target.pos, excutor).memory];
            return TaskResult.Working;
        }
        else
            return TaskResult.Fatal;
    }
    isFinished(excutor?: Excutable): boolean {
        const target = Game.getObjectById<Structure>(this.memory.targetId);
        return isCreeepFull(excutor) || !isLoadable(target, this.memory.resource);
    }
}
/** 囤积资源任务 */
export class StoreTask extends ResourceTask {
    memory: StoreTaskMemory;
    constructor(memory: TaskMemory) {
        if (memory.type != TaskType.Store)
            throw new Error("task load bug in StoreTask");
        super(memory);
        this.memory = memory;
        this.emoji = "⏬";
    }
    canExcute(excutor: Excutable) {
        return checkSource(this.memory.from) ? super.canExcute(excutor) : 0;
    }
    useAction(excutor: Creep, target: RoomObject): ScreepsReturnCode {
        return excutor.transfer(<OwnedStructure<StructureConstant>>target, this.memory.resource);
    }
    isFinished(): boolean {
        const target = Game.getObjectById<Structure>(this.memory.targetId);
        if (!checkSource(this.memory.from))
            return true;
        return !isStorable(target);
    }
    protected getResourceTask(excutor: Creep): TaskMemory {
        return {
            type: TaskType.Harvest,
            priority: PRIORITY_NORMAL,
            targetId: this.memory.from,
            startTick: Game.time,
        };
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
    useAction(excutor: Creep, target: RoomObject): ScreepsReturnCode {
        return excutor.upgradeController(<StructureController>target);
    }
    isFinished(): boolean {
        const controller = Game.getObjectById<StructureController>(this.memory.targetId);
        return !controller || (this.memory.safeTicks && controller.ticksToDowngrade > this.memory.safeTicks) || false;
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
    useAction(excutor: Creep, target: RoomObject): ScreepsReturnCode {
        return excutor.build(<ConstructionSite>target);
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
    useAction(excutor: Creep, target: RoomObject): ScreepsReturnCode {
        return excutor.repair(<Structure>target);
    }
    isFinished(): boolean {
        const struct = Game.getObjectById<Structure>(this.memory.targetId);
        if (!struct)
            return true;
        return this.memory.hits ? struct.hits >= this.memory.hits : struct.hits == struct.hitsMax;
    }
}

const FindTask = {
    [TaskType.Move]: MoveTask,
    [TaskType.Harvest]: HarvestTask,
    [TaskType.Transfer]: TransferTask,
    [TaskType.UpgradeController]: UpgradeControllerTask,
    [TaskType.Build]: BuildTask,
    [TaskType.Repair]: RepairTask,
    [TaskType.SpawnCreep]: SpawnCreepTask,
    [TaskType.Store]: StoreTask,
    [TaskType.Load]: LoadTask,
};

/** 根据memory创建任务实例  */
export function loadTask(memory: TaskMemory): Task {
    return new FindTask[memory.type](memory);
}