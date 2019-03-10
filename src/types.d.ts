type TaskMemory = MoveTaskMemory
  | HarvestTaskMemory
  | ChargeTaskMemory
  | UpgradeControllerTaskMemory
  | BuildTaskMemory
  | RepairTaskMemory
  | SpawnCreepTaskMemory
  | StoreTaskMemory
  | LoadTaskMemory
  | TransferTaskMemory
  | AttackTaskMemory
  | PickTaskMemory;

declare const enum TaskResult {
  /** 已完成 */
  Finished = "finished",
  /** 尚未完成 */
  Working = "working",
  /** 失败，当任务仍然可以分配给其他执行者 */
  Fail = "fail",
  /** 失败，且不可继续 */
  Fatal = "fatal",
  /** 尚未完成，但是可以被移交或暂停 */
  Acceptable = "acceptable",
}
declare const enum TaskType {
  Idle = "idle",
  Move = "move",
  Harvest = "harvest",
  Charge = "charge",
  UpgradeController = "upgrade",
  Build = "build",
  Repair = "repair",
  SpawnCreep = "spawn",
  Store = "store",
  Load = "load",
  Transfer = "transfer",
  Attack = "attack",
  Pick = "pick"
}
declare const enum Role {
  Worker = "Worker",
  Miner = "Miner",
  Carrier = "Carrier",
  Upgrader = "Upgrader",
}
interface TaskMemoryBase {
  type: string;
  priority: number;
  lastResult?: TaskResult;
  targetId?: string;
  startTick?: number;
  child?: TaskMemory[];
  tag?: string,
  uninterruptible?: boolean;
  timeout?: number;
  only?: Role;
}

interface MoveTaskMemory extends TaskMemoryBase {
  type: TaskType.Move;
  pos: RoomPosition;
  range: number;
}
interface HarvestTaskMemory extends TaskMemoryBase {
  type: TaskType.Harvest;
  reachTick?: number;
  targetId: string;
}
interface ChargeTaskMemory extends TaskMemoryBase {
  type: TaskType.Charge;
  targetId: string;
}
interface LoadTaskMemory extends TaskMemoryBase {
  type: TaskType.Load;
  resource: ResourceConstant;
  targetId: string;
}
interface StoreTaskMemory extends TaskMemoryBase {
  type: TaskType.Store;
  resource: ResourceConstant;
  from?: string;
  targetId: string;
}
interface UpgradeControllerTaskMemory extends TaskMemoryBase {
  type: TaskType.UpgradeController;
  safeTicks?: number;
}
interface BuildTaskMemory extends TaskMemoryBase {
  type: TaskType.Build;
  targetId: string;
}
interface RepairTaskMemory extends TaskMemoryBase {
  type: TaskType.Repair;
  hits?: number;
  targetId: string;
}
interface PickTaskMemory extends TaskMemoryBase {
  type: TaskType.Pick;
  targetId: string;
  from: string;
}
interface SpawnCreepTaskMemory extends TaskMemoryBase {
  type: TaskType.SpawnCreep;
  body: BodyPartConstant[];
  role: Role;
  corps: string;
  name?: string;
}
interface TransferTaskMemory extends TaskMemoryBase {
  type: TaskType.Transfer,
  targetId: string,
  from: string,
  resource: ResourceConstant;
  loaded?: boolean;
}
interface AttackTaskMemory extends TaskMemoryBase {
  type: TaskType.Attack;
  targetId: string;
}

interface TaskCounter {
  [type: string]: { [tag: string]: number };
}
type Node = { type: BuildableStructureConstant; pos: RoomPosition; id?: string }
interface Blueprint extends Array<Node> {
  completed?: boolean;
}
interface CreepMemory {
  role: Role;
  task?: TaskMemory;
}

interface SpawnMemory {
  task?: TaskMemory;
}
interface CorpsMemory {
  name: string;
  roomName: string;
  spawns: string[];
  creeps: string[];
  taskQueue: TaskMemory[];
  counter: TaskCounter;
  nextPolicy: number;
  aveQueueLength: number;
  reset?: boolean;
  blueprints: { [name: string]: Blueprint };
}
interface RoomMemory {
  sources: { [key: string]: number };
  towers: { [key: string]: TaskMemory };
  heatMap: { [key: string]: number };
}

interface Memory {
  uuid: number;
  log: any;
  corps: { [name: string]: CorpsMemory }
}

// `global` extension samples
declare namespace NodeJS {
  interface Global {
    log: any;
  }
}
