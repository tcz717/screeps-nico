type TaskMemory = MoveTaskMemory
  | HarvestTaskMemory
  | TransferTaskMemory
  | UpgradeControllerTaskMemory
  | BuildTaskMemory
  | RepairTaskMemory;

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
  Idle = "i",
  Move = "m",
  Harvest = "h",
  Transfer = "t",
  UpgradeController = "u",
  Build = "b",
  Repair = "r",
}
interface TaskMemoryBase {
  type: string;
  priority: number;
  lastResult?: TaskResult;
  excutorId?: string;
  targetId?: string;
  startTick?: number;
  child?: TaskMemory[];
  uninterruptible?: boolean;
}

interface MoveTaskMemory extends TaskMemoryBase {
  type: TaskType.Move;
  pos: RoomPosition;
  range: number;
}
interface HarvestTaskMemory extends TaskMemoryBase {
  type: TaskType.Harvest;
  reachTick?: number;
}
interface TransferTaskMemory extends TaskMemoryBase {
  type: TaskType.Transfer;
  resource: ResourceConstant;
}
interface UpgradeControllerTaskMemory extends TaskMemoryBase {
  type: TaskType.UpgradeController;
  level?: number;
}
interface BuildTaskMemory extends TaskMemoryBase {
  type: TaskType.Build;
}
interface RepairTaskMemory extends TaskMemoryBase {
  type: TaskType.Repair;
}

interface Role {
  run(creep: Creep): void;
}

interface ObjectMemory {
  [key: string]: number;
}

interface CreepMemory {
  role: string;
  working: boolean;
}

interface SpawnMemory {

}

interface RoomMemory {
  expectedLevel: number;
  expectedWorkers: number;
  assignedTasks: TaskMemory[];
  taskQueue: TaskMemory[];
  objects: { [key: string]: ObjectMemory };
  sources: { [key: string]: number };
}

interface Memory {
  uuid: number;
  log: any;
}

// `global` extension samples
declare namespace NodeJS {
  interface Global {
    log: any;
  }
}
