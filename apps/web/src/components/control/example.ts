/** Canonical, import-ready example (also rendered in the schema panel). */
export const EXAMPLE_DOC = {
  goals: [
    { reward: "Q&A", note: "1 sub" },
    { reward: "Phasmophobia", note: "5 subs" },
    { reward: "Onesie reveal", note: "10 subs" },
    { reward: "Cake on cam", note: "15 subs" },
    { reward: "Confetti chaos", note: "25 subs" },
    { reward: "Stretch goal", note: "dream" },
  ],
};

export const EXAMPLE_JSON = JSON.stringify(EXAMPLE_DOC, null, 2);
