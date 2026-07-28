// 角色状态解析器：根据优先级与素材可用性，决定桌宠当前形象。
// 纯函数：不读取磁盘，只做状态 -> 形象的映射；素材是否可用由调用方传入。
// 任何素材缺失必须回退到 default，绝不抛错（任务文档 §3 + P0 验收）。

/**
 * 状态优先级，从高到低（任务文档 §3）。
 * happy 是"完成提醒后"的短暂回应，故优先级低于提醒态。
 * P0 实现 do_not_disturb / reminder_drink / working / leisure / happy；
 * sleeping / reminder_stretch / reminder_eyes 解析逻辑预留，P0 无计时驱动。
 */
const STATE_PRIORITY = [
  'do_not_disturb',
  'reminder_drink',
  'reminder_stretch',
  'reminder_eyes',
  'happy',
  'working',
  'leisure',
  'sleeping'
];

// 状态标识 -> 素材文件名映射
const STATE_IMAGE_MAP = {
  default: 'default.png',
  do_not_disturb: 'do-not-disturb.png',
  working: 'working.png',
  leisure: 'leisure.png',
  reminder_drink: 'drinking.png',
  reminder_stretch: 'stretching.png',
  reminder_eyes: 'eyes-rest.png',
  sleeping: 'sleeping.png',
  happy: 'happy.png'
};

// 状态简短文字（pet 窗状态行 + 主窗角色舞台共用）
const STATE_TEXT_MAP = {
  default: '在这里陪你',
  do_not_disturb: '安静时段',
  working: '工作中',
  leisure: '看书',
  reminder_drink: '该喝水了',
  reminder_stretch: '活动一下',
  reminder_eyes: '看看远处',
  sleeping: '休息中',
  happy: '做得好'
};

const DEFAULT_IMAGE = 'default.png';
const ASSET_BASE = './assets/character-states/';

/**
 * 解析当前角色形象。
 *
 * @param {object} input
 * @param {string} input.manualState 用户手动选择的状态：working / leisure / do_not_disturb
 * @param {string|null} [input.reminder] 当前到期的提醒类型：drink / stretch / eyes
 * @param {boolean} [input.quietActive] 是否处于安静时段 / 免打扰
 * @param {string|null} [input.happyActive] 是否处于 happy 短暂态
 * @param {boolean} [input.sleepActive] 是否处于睡眠状态（夜间/idle）
 * @param {Set<string>|string[]} [input.availableAssets] 已就绪的素材文件名集合
 * @returns {{ stateKey: string, imageSrc: string, fallbackUsed: boolean, statusText: string }}
 */
function resolveCharacter(input = {}) {
  const {
    manualState = 'leisure',
    reminder = null,
    quietActive = false,
    happyActive = false,
    sleepActive = false,
    availableAssets = []
  } = input;

  const available = availableAssets instanceof Set
    ? availableAssets
    : new Set(Array.isArray(availableAssets) ? availableAssets : [availableAssets]);

  // 1. 计算逻辑状态（按优先级，任务文档 §3）
  // 优先级从高到低：免打扰 > 临时关怀提醒 > happy(完成提醒后的短暂回应) > 手动工作/免打扰 > 睡眠 > 休闲
  // sleeping 仅在用户处于休闲或未手动选择状态时自动激活
  let stateKey;
  if (quietActive) {
    stateKey = 'do_not_disturb';
  } else if (reminder) {
    stateKey = `reminder_${reminder}`;
  } else if (happyActive) {
    stateKey = 'happy';
  } else if (manualState === 'working' || manualState === 'do_not_disturb') {
    stateKey = manualState;
  } else if (sleepActive) {
    stateKey = 'sleeping';
  } else if (manualState === 'leisure') {
    stateKey = 'leisure';
  } else {
    stateKey = 'leisure';
  }

  // 2. 映射素材文件名
  const wantedImage = STATE_IMAGE_MAP[stateKey] || DEFAULT_IMAGE;

  // 3. 素材可用性回退
  let imageFile = wantedImage;
  let fallbackUsed = false;
  if (!available.has(imageFile)) {
    imageFile = DEFAULT_IMAGE;
    fallbackUsed = true;
    // 连默认都没有时，仍返回路径，由渲染层 <img onerror> 兜底
    if (!available.has(DEFAULT_IMAGE)) {
      // 路径照常返回，渲染层处理
    }
  }

  return {
    stateKey,
    imageSrc: `${ASSET_BASE}${imageFile}`,
    fallbackUsed,
    statusText: STATE_TEXT_MAP[stateKey] || STATE_TEXT_MAP.default
  };
}

/**
 * 列出全部已知状态的素材文件名，供主窗展示素材就绪状态。
 */
function listKnownStateImages() {
  return [...new Set(Object.values(STATE_IMAGE_MAP))];
}

module.exports = {
  STATE_PRIORITY,
  STATE_IMAGE_MAP,
  STATE_TEXT_MAP,
  resolveCharacter,
  listKnownStateImages
};
