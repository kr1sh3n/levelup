// The muscle groups weekly volume is tracked against. Every anatomical
// muscle drawn on the 3D figure (see bodyModel.js) belongs to exactly one.

export const MUSCLE_GROUPS = {
  chest: { label: "Chest", includes: "Pectoralis major (upper and lower)" },
  front_delts: { label: "Front Delts", includes: "Anterior deltoid" },
  side_delts: { label: "Side Delts", includes: "Lateral deltoid" },
  rear_delts: { label: "Rear Delts", includes: "Posterior deltoid" },
  traps: { label: "Upper Traps", includes: "Upper trapezius and neck muscles" },
  upper_back: {
    label: "Mid Back",
    includes: "Middle and lower trapezius, rhomboids, teres, infraspinatus",
  },
  lats: { label: "Lats", includes: "Latissimus dorsi" },
  lower_back: { label: "Lower Back", includes: "Erector spinae" },
  biceps: { label: "Biceps", includes: "Biceps brachii, brachialis" },
  triceps: { label: "Triceps", includes: "Triceps brachii (long and lateral heads)" },
  forearms: { label: "Forearms", includes: "Wrist flexors and extensors, brachioradialis" },
  abs: { label: "Abs", includes: "Rectus abdominis" },
  obliques: { label: "Obliques", includes: "Obliques and serratus anterior" },
  glutes: { label: "Glutes", includes: "Gluteus maximus and medius, tensor fasciae latae" },
  quads: { label: "Quads", includes: "Rectus femoris, vastus lateralis, vastus medialis, sartorius" },
  hamstrings: {
    label: "Hamstrings",
    includes: "Biceps femoris, semitendinosus, semimembranosus",
  },
  adductors: { label: "Adductors", includes: "Inner-thigh adductors and gracilis" },
  calves: { label: "Calves & Shins", includes: "Gastrocnemius, soleus, tibialis anterior" },
};

export const GROUP_IDS = Object.keys(MUSCLE_GROUPS);

export const isGroup = (id) => Object.hasOwn(MUSCLE_GROUPS, id);

export const groupLabel = (id) => MUSCLE_GROUPS[id]?.label || id;

// Used by the balance checks in insights.js.
export const PUSH_GROUPS = ["chest", "front_delts", "side_delts", "triceps"];
export const PULL_GROUPS = ["lats", "upper_back", "rear_delts", "biceps"];
