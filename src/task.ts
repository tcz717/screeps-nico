
import _ from "lodash";
import { recordMineDuration, recordHeatMap } from "metric";
import { surroundingPos, walkable, isLoadable, isEnergyContainer, isStorable, isMineable, getResourceAmount } from "utils/helper";
import { type } from "os";
export type Excutable = Creep | StructureSpawn | StructureTower;
type Worker = Creep | StructureTower;

export const PRIORITY_EMERGENCY = 2000;
export const PRIORITY_HIGH = 1500;
export const PRIORITY_NORMAL = 1000;
export const PRIORITY_LOW = 500;

export function isCreepFull(excutor?: Excutable): boolean {
    return excutor && excutor instanceof Creep && _(excutor.carry).values().sum() == excutor.carryCapacity || false;
}
export function isCreepEmpty(excutor?: Excutable): boolean {
    return excutor && excutor instanceof Creep && _(excutor.carry).values().sum() == 0 || false;
}
export function creepHas(excutor: Excutable | undefined, resource: ResourceConstant): boolean {
    return excutor instanceof Creep && _.get(excutor.carry, resource, 0)! > 0 || false;
}

export function getTaskMemory(excutor: Excutable): TaskMemory | undefined {
    if (excutor instanceof StructureTower)
        return _.get(excutor.room.memory, ["towers", excutor.id]);
    else
        return excutor.memory.task;
}
export function setTaskMemory(excutor: Excutable, memory?: TaskMemory): void {
    if (excutor instanceof StructureTower)
        _.set(excutor.room.memory, ["towers", excutor.id], memory);
    else {
        excutor.memory.task = memory;
    }
}
export function isAvailable(excutor: Excutable): boolean {
    return !(excutor instanceof Creep) || !excutor.spawning;
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
    reset(): void {
        this.memory.lastResult = undefined;
        this.memory.child = [];
    }
    /** 检测任务是否已经完成， 用于优化 */
    abstract isFinished(excutor?: Excutable): boolean;
    /** 用于处理任务结束的收尾 */
    drop(): void {
        console.log(`task ${this.memory.type} ${this.memory.lastResult} in ${this.memory.startTick && Game.time - this.memory.startTick || 'N/A'} ticks`);
        _.forEach(this.memory.child, memory => loadTask(memory).drop());
    }
    protected excuteChild(excutor: Excutable): TaskResult | undefined {
        if (this.memory.child && this.memory.child.length) {
            const task = loadTask(this.memory.child![0]);
            let result = task.excute(excutor);
            if (result == TaskResult.Finished) {
                this.memory.child!.shift();
                task.drop();
                return this.memory.lastResult = TaskResult.Working;
            }
            return this.memory.lastResult = result;
        }
        return undefined;
    }
    protected checkRole(excutor: Creep) {
        return excutor.memory.role == _.defaultTo(this.memory.only, Role.Worker);;
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
            recordHeatMap(excutor.pos);
            if (excutor.pos.inRangeTo(this.pos, this.memory.range))
                return this.memory.lastResult = TaskResult.Finished;
            const result = excutor.moveTo(this.pos, {
                visualizePathStyle: {},
                maxRooms: 1
            });
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
        const result = excutor.spawnCreep(this.memory.body, "FACKNAME", { dryRun: true });
        if (result != OK)
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
    constructor(memory: TaskMemory) {
        super(memory);
    }
    assign(excutor: Excutable): void {
        if (excutor instanceof Creep) {
            console.log("assigned " + this.memory.type + " to " + excutor.name)
            super.assign(excutor);
        }
        else
            throw new Error("assign bug in " + this.memory.type);
    }
    canExcute(excutor: Excutable): number {
        if (!(excutor instanceof Creep))
            return 0;
        return this.canCreepExcute(excutor);
    }
    protected canCreepExcute(excutor: Creep): number {
        const body = _(excutor.body).countBy('type');
        if (!this.checkRole(excutor) || _.every([WORK, CARRY, MOVE], _.propertyOf(body.values())))
            return 0;
        const d = this.memory.targetId ? excutor.pos.getRangeTo(Game.getObjectById<RoomObject>(this.memory.targetId)!.pos) : 1;
        return body.values().sum() / d;
    }
    excute(excutor: Excutable): TaskResult {
        if (excutor == null || !(excutor instanceof Creep || excutor instanceof StructureTower))
            return this.memory.lastResult = TaskResult.Fail;
        if (this.isFinished(excutor))
            return this.memory.lastResult = TaskResult.Finished;
        if (_.isEmpty(this.memory.child)) {
            this.excuteMain(excutor);
            this.excuteChild(excutor);
        }
        else {
            this.excuteChild(excutor);
            if (_.isEmpty(this.memory.child))
                this.excuteMain(excutor);
        }
        return this.memory.lastResult!;
    }
    private excuteMain(excutor: Creep | StructureTower) {
        if (this.emoji && excutor instanceof Creep)
            excutor.say(this.emoji);
        this.memory.lastResult = this.mainAction(excutor);
    }

    abstract mainAction(excutor: Worker): TaskResult;
    abstract isFinished(excutor?: Excutable): boolean;
}
/** 采集任务 */
export class HarvestTask extends WorkTask {
    emoji = "⛏";
    static harvest(pos: RoomPosition, resource: ResourceConstant, priority = PRIORITY_NORMAL, excutor?: Creep): HarvestTask {
        if (resource != RESOURCE_ENERGY)
            throw new Error("only energy implemented.");
        const sourceDuration = Game.rooms[pos.roomName].memory.sources;
        var source = pos.findClosestByRange(FIND_SOURCES_ACTIVE, { filter: s => surroundingPos(s.pos).filter(walkable).length })
        if (!source)
            source = pos.findClosestByRange(FIND_SOURCES_ACTIVE);
        const task = new HarvestTask({
            type: TaskType.Harvest,
            priority: priority,
            targetId: source!.id,
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
            if (!isCreepFull(excutor))
                return TaskResult.Acceptable;
            else
                return TaskResult.Finished;
        }
        else if (result == ERR_TIRED)
            return TaskResult.Acceptable;
        else if (result == ERR_NOT_IN_RANGE) {
            this.memory.child = [MoveTask.moveTo(source.pos, excutor).memory];
            return TaskResult.Working;
        }
        else
            return TaskResult.Fatal;
    }
    isFinished(excutor?: Excutable): boolean {
        return isCreepFull(excutor);
    }
    drop(): void {
        super.drop();
        const source = Game.getObjectById<Source>(this.memory.targetId);
        if (this.memory.startTick && source) {
            const duration = this.memory.reachTick ? this.memory.reachTick - this.memory.startTick : 1000;
            recordMineDuration(source, duration);
        }
    }
}

export class PickTask extends WorkTask {
    emoji = '♻'
    memory: PickTaskMemory
    constructor(memory: TaskMemory) {
        super(memory);
        if (memory.type != TaskType.Pick)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
    }
    mainAction(excutor: Worker): TaskResult {
        const resource = Game.getObjectById<Resource>(this.memory.from);
        if (excutor instanceof StructureTower)
            return TaskResult.Fatal;
        if (resource == null || isCreepFull(excutor)) {
            if (isCreepEmpty(excutor))
                return TaskResult.Finished;
            this.memory.child = _(excutor.carry)
                .pickBy()
                .keys()
                .map(r => ({
                    type: TaskType.Store,
                    targetId: this.memory.targetId,
                    priority: PRIORITY_NORMAL,
                    resource: r
                } as StoreTaskMemory))
                .value();
            return TaskResult.Working;
        }
        let result = excutor.pickup(resource);
        if (result == OK)
            return TaskResult.Working;
        if (result == ERR_NOT_IN_RANGE) {
            this.memory.child = [MoveTask.moveTo(resource.pos, excutor).memory];
            return TaskResult.Working;
        }
        else
            return TaskResult.Fatal;
    }
    isFinished(excutor?: Creep | StructureTower | StructureSpawn | undefined): boolean {
        const resource = Game.getObjectById<Resource>(this.memory.targetId);
        return resource == null && (excutor == undefined || isCreepEmpty(excutor));
    }
}
/** 需要采集资源并消耗的任务 */
export abstract class ResourceTask extends WorkTask {
    resource: ResourceConstant;
    range = 1;
    greedy = false;
    constructor(memory: TaskMemory, resource: ResourceConstant = RESOURCE_ENERGY) {
        super(memory);
        this.resource = resource;
    }
    mainAction(excutor: Worker): TaskResult {
        const target = Game.getObjectById<Structure>(this.memory.targetId as Id<Structure>);
        if (!target || excutor instanceof StructureTower)
            return TaskResult.Fatal;
        let result = this.useAction(excutor, target);
        if (!excutor.carry[this.resource]) {
            return this.getResource(excutor);
        }

        if (result == OK)
            return this.greedy ? TaskResult.Working : TaskResult.Finished;
        else if (result == ERR_NOT_ENOUGH_RESOURCES) {
            return this.getResource(excutor);
        }
        else if (result == ERR_NOT_IN_RANGE) {
            this.memory.child = [MoveTask.moveTo(target.pos, excutor, this.range).memory];
            return TaskResult.Acceptable;
        }
        else {
            console.log(`${JSON.stringify(this.memory)} got ${result} and fail`)
            return TaskResult.Fail;
        }
    }
    private getResource(excutor: Creep) {
        const subTask = this.getResourceTask(excutor);
        if (subTask) {
            this.memory.child = [subTask];
            return TaskResult.Acceptable;
        }
        return TaskResult.Finished;
    }

    protected getResourceTask(excutor: Creep): TaskMemory | undefined {
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

    abstract useAction(excutor: Worker, target: RoomObject): ScreepsReturnCode;
}
/** 建筑物充能任务 */
export class ChargeTask extends ResourceTask {
    memory: ChargeTaskMemory;
    constructor(memory: TaskMemory) {
        if (memory.type != TaskType.Charge)
            throw new Error("task load bug in Charge");
        super(memory, RESOURCE_ENERGY);
        this.memory = memory;
        this.emoji = "⛽";
    }
    useAction(excutor: Creep, target: RoomObject): ScreepsReturnCode {
        return excutor.transfer(<OwnedStructure<StructureConstant>>target, this.resource);
    }
    isFinished(): boolean {
        const target = Game.getObjectById<OwnedStructure>(this.memory.targetId);
        if (isEnergyContainer(target))
            return target && target.energy == target.energyCapacity || false;
        return false;
    }
}
export class TransferTask extends ResourceTask {
    memory: TransferTaskMemory;
    constructor(memory: TaskMemory) {
        if (memory.type != TaskType.Transfer)
            throw new Error("task load bug in Transfer");
        super(memory, memory.resource);
        this.memory = memory;
        this.emoji = "🔄";
        this.greedy = Game.getObjectById(this.memory.from) instanceof Tombstone;
    }
    protected getResourceTask(excutor: Creep): TaskMemory {
        const storage = Game.getObjectById<Structure | Tombstone>(this.memory.from);
        if (storage) {
            return {
                type: TaskType.Load,
                priority: PRIORITY_NORMAL,
                targetId: storage.id,
                resource: this.resource,
                startTick: Game.time,
            }
        }
        throw `${storage} not exsist`;
    }
    canExcute(excutor: Excutable): number {
        return excutor instanceof Creep && !isCreepFull(excutor) ? super.canExcute(excutor) : 0;
    }
    useAction(excutor: Creep, target: RoomObject): ScreepsReturnCode {
        return excutor.transfer(<OwnedStructure>target, this.resource);
    }
    isFinished(excutor?: Excutable): boolean {
        const target = Game.getObjectById<Structure>(this.memory.targetId);
        const storage = Game.getObjectById<Structure | Tombstone>(this.memory.from);
        return !isStorable(target) || (!isLoadable(storage, this.resource) && !creepHas(excutor, this.resource));
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
        return isCreepFull(excutor) || !isLoadable(target, this.memory.resource);
    }
}
/** 囤积资源任务 */
export class StoreTask extends ResourceTask {
    memory: StoreTaskMemory;
    constructor(memory: TaskMemory) {
        if (memory.type != TaskType.Store)
            throw new Error("task load bug in StoreTask");
        super(memory, memory.resource);
        this.memory = memory;
        this.emoji = "⏬";
        this.greedy = true;
    }
    canExcute(excutor: Excutable) {
        return isMineable(this.memory.from) || creepHas(excutor, this.memory.resource) ? super.canExcute(excutor) : 0;
    }
    useAction(excutor: Creep, target: RoomObject): ScreepsReturnCode {
        const result = excutor.transfer(<OwnedStructure>target, this.memory.resource);
        if (result == ERR_NOT_ENOUGH_RESOURCES && !this.memory.from)
            return OK;
        return result;
    }
    isFinished(): boolean {
        const target = Game.getObjectById<Structure>(this.memory.targetId);
        if (this.memory.from && !isMineable(this.memory.from))
            return true;
        return !isStorable(target);
    }
    protected getResourceTask(excutor: Creep): TaskMemory | undefined {
        if (!this.memory.from)
            return undefined;
        return {
            type: TaskType.Harvest,
            priority: PRIORITY_NORMAL,
            targetId: this.memory.from!,
            startTick: Game.time,
        };
    }
}
/** 控制器升级任务 */
export class UpgradeControllerTask extends ResourceTask {
    memory: UpgradeControllerTaskMemory;
    greedy = true;
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
        const controller = Game.getObjectById<StructureController>(this.memory.targetId as Id<StructureController>);
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
        this.greedy = true;
    }
    useAction(excutor: Creep, target: RoomObject): ScreepsReturnCode {
        return excutor.build(<ConstructionSite>target);
    }
    isFinished(): boolean {
        return Game.getObjectById<ConstructionSite>(this.memory.targetId) == null;
    }
}
/** 表示既可以由Creep完成也可由Tower完成的任务 */
abstract class CreepTowerTask extends ResourceTask {
    constructor(memory: TaskMemory) {
        super(memory, RESOURCE_ENERGY);
    }
    assign(excutor: Excutable): void {
        if (excutor instanceof Creep || excutor instanceof StructureTower) {
            console.log("assigned " + this.memory.type + " to " + excutor.id)
            this.memory.startTick = Game.time;
        }
        else
            throw new Error("assign bug in " + this.memory.type);
    }
    canExcute(excutor: Excutable): number {
        if (excutor instanceof StructureTower)
            return this.canTowerExcute(excutor);
        return super.canExcute(excutor);
    }
    canTowerExcute(tower: StructureTower): number {
        const target = Game.getObjectById<Structure>(this.memory.targetId as Id<Structure>);
        if (tower.energy < TOWER_ENERGY_COST || !target)
            return 0;
        return 50 - _.clamp(tower.pos.getRangeTo(target), TOWER_OPTIMAL_RANGE, TOWER_FALLOFF_RANGE) / 3;
    }
    mainAction(excutor: Worker): TaskResult {
        if (excutor instanceof Creep)
            return super.mainAction(excutor);
        const target = Game.getObjectById<Structure>(this.memory.targetId as Id<Structure>);
        if (!target)
            return TaskResult.Fatal;
        const result = this.useAction(excutor, target);

        if (result == OK)
            return this.greedy ? TaskResult.Working : TaskResult.Finished;
        else
            return TaskResult.Fail;
    }
    abstract useAction(worker: Worker, target: RoomObject): ScreepsReturnCode;
}
/** 修理任务 */
export class RepairTask extends CreepTowerTask {
    memory: RepairTaskMemory;
    constructor(memory: TaskMemory) {
        super(memory);
        if (memory.type != TaskType.Repair)
            throw new Error("task load bug in " + typeof this);
        this.memory = memory;
        this.range = 3;
        this.emoji = "🔧";
    }
    useAction(excutor: Worker, target: RoomObject): ScreepsReturnCode {
        return excutor.repair(<Structure>target);
    }
    isFinished(): boolean {
        const struct = Game.getObjectById<Structure>(this.memory.targetId);
        if (!struct)
            return true;
        return this.memory.hits ? struct.hits >= this.memory.hits : struct.hits == struct.hitsMax;
    }
}

export class AttackTask extends Task {
    memory: AttackTaskMemory;
    constructor(memory: TaskMemory) {
        super(memory);
        if (memory.type != TaskType.Attack)
            throw new Error("task load bug in " + TaskType.Repair);
        this.memory = memory;
    }
    private checkCreep(excutor: Creep) {
        const body = _(excutor.body).countBy('type');
        if (!this.checkRole(excutor) || !_.every([ATTACK, RANGED_ATTACK, MOVE], _.propertyOf(body.values())))
            return 0;
        return body.values().sum();
    }
    canExcute(excutor: Excutable): number {
        if (excutor instanceof Creep)
            return this.checkCreep(excutor);
        if (excutor instanceof StructureTower)
            return 1;
        return 0;
    }
    excute(excutor: Excutable): TaskResult {
        const attacker = excutor as Creep | StructureTower;
        if (this.isFinished(attacker))
            return this.memory.lastResult = TaskResult.Finished;
        const target = Game.getObjectById<Creep>(this.memory.targetId)!;
        const result = attacker instanceof Creep ? attacker.attack(target) : attacker.attack(target);
        console.log("attack:", result)
        if (result == ERR_NOT_IN_RANGE) {
            (attacker as Creep).moveTo(target);
            return this.memory.lastResult = TaskResult.Working;
        }
        return this.memory.lastResult = (result == OK ? TaskResult.Acceptable : TaskResult.Fail);
    }
    isFinished(excutor?: Excutable): boolean {
        const target = Game.getObjectById<Creep>(this.memory.targetId);
        return target == undefined;
    }
}

const FindTask = {
    [TaskType.Move]: MoveTask,
    [TaskType.Harvest]: HarvestTask,
    [TaskType.Charge]: ChargeTask,
    [TaskType.UpgradeController]: UpgradeControllerTask,
    [TaskType.Build]: BuildTask,
    [TaskType.Repair]: RepairTask,
    [TaskType.SpawnCreep]: SpawnCreepTask,
    [TaskType.Store]: StoreTask,
    [TaskType.Load]: LoadTask,
    [TaskType.Transfer]: TransferTask,
    [TaskType.Attack]: AttackTask,
    [TaskType.Pick]: PickTask,
};

/** 根据memory创建任务实例  */
export function loadTask(memory: TaskMemory): Task {
    return new FindTask[memory.type](memory);
}
