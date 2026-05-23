export const tempVoiceStrings = {
  panelTitle: "Управление голосовым каналом",
  panelDescription:
    "Создайте канал, зайдя в **➕ Создать канал**, затем используйте кнопки ниже.\n\n" +
    "**Название** — переименовать\n" +
    "**Лимит** — лимит участников (0 = без лимита)\n" +
    "**Доступ** — закрыть/открыть для всех\n" +
    "**Чат** — создать или удалить текстовый чат\n" +
    "**Пригласить** — ссылка-приглашение\n" +
    "**Выгнать** — отключить участника\n" +
    "**Удалить** — удалить канал\n" +
    "**Регион** — голосовой регион",
  panelFooter: "Кнопки работают только для владельца активного канала.",
  btnName: "Название",
  btnLimit: "Лимит",
  btnAccess: "Доступ",
  btnChat: "Чат",
  btnInvite: "Пригласить",
  btnKick: "Выгнать",
  btnDelete: "Удалить",
  btnRegion: "Регион",
  btnDeleteConfirm: "Подтвердить удаление",
  noActiveRoom: "У вас нет активного голосового канала. Зайдите в **➕ Создать канал**.",
  notOwner: "Эту панель может использовать только владелец канала.",
  hubMoveFailed: "Не удалось создать или переместить вас в канал. Проверьте права бота.",
  nameModalTitle: "Название канала",
  nameModalLabel: "Новое название",
  limitModalTitle: "Лимит участников",
  limitModalLabel: "Число (0 = без лимита)",
  nameUpdated: (name: string) => `Название изменено: **${name}**`,
  limitUpdated: (n: number) => (n === 0 ? "Лимит снят (без ограничения)." : `Лимит: **${n}**`),
  accessLocked: "Канал закрыт — подключаться могут только те, у кого уже есть доступ.",
  accessUnlocked: "Канал открыт для всех.",
  chatCreated: (channelId: string) => `Текстовый чат создан: <#${channelId}>`,
  chatRemoved: "Текстовый чат удалён.",
  inviteLink: (url: string) => `Ссылка-приглашение (24 ч):\n${url}`,
  kickPrompt: "Выберите участника для отключения из вашего канала.",
  kickDone: (userId: string) => `<@${userId}> отключён от канала.`,
  kickNotInChannel: "Этот пользователь не в вашем голосовом канале.",
  deletePrompt: "Нажмите **Подтвердить удаление**, чтобы удалить голосовой канал и чат.",
  deleteDone: "Канал удалён.",
  regionPrompt: "Выберите голосовой регион.",
  regionUpdated: (label: string) => `Регион: **${label}**`,
  invalidLimit: "Укажите число от 0 до 99.",
  invalidName: "Название не может быть пустым.",
  voicepanelChannel: "Канал для панели",
  voicepanelPosted: (channelId: string) => `Панель опубликована в <#${channelId}>.`,
  voiceNotConfigured: "Temp voice не настроен (env: DISCORD_VOICE_ENABLED и ID каналов).",
  actionFailed: "Не удалось выполнить действие. Проверьте права бота в категории.",
} as const;

export const TEMP_VOICE_REGIONS: { label: string; value: string }[] = [
  { label: "Авто", value: "auto" },
  { label: "Rotterdam", value: "rotterdam" },
  { label: "US East", value: "us-east" },
  { label: "US West", value: "us-west" },
  { label: "US Central", value: "us-central" },
  { label: "Brazil", value: "brazil" },
  { label: "Singapore", value: "singapore" },
  { label: "Japan", value: "japan" },
  { label: "Hong Kong", value: "hongkong" },
  { label: "Sydney", value: "sydney" },
  { label: "India", value: "india" },
  { label: "South Africa", value: "southafrica" },
];

export const VOICE_BUTTON_PREFIX = "voice:";
