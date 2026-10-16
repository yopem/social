import * as stylex from "@stylexjs/stylex"

import { tokens } from "ui/styles/tokens.stylex"

export const deskStyles = stylex.create({
  stack: {
    display: "grid",
    gap: `calc(${tokens["--spacing"]} * 4)`,
    minWidth: 0,
  },
  formErrors: {
    blockSize: `calc(${tokens["--spacing"]} * 12)`,
  },
  label: {
    display: "grid",
    gap: `calc(${tokens["--spacing"]} * 2)`,
    fontSize: 14,
    minWidth: 0,
  },
  labelText: { fontSize: 14, fontWeight: 500, lineHeight: 1.5 },
  check: {
    display: "flex",
    gap: `calc(${tokens["--spacing"]} * 2.5)`,
    alignItems: "center",
    minHeight: 44,
  },
  text: {
    fontSize: "0.875rem",
    lineHeight: 1.6,
    overflowWrap: "anywhere",
    fontVariantNumeric: "tabular-nums",
  },
  danger: {
    color: tokens["--destructive-foreground"],
    overflowWrap: "anywhere",
  },
  pageHeader: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: `calc(${tokens["--spacing"]} * 4)`,
    paddingBlockEnd: `calc(${tokens["--spacing"]} * 5)`,
    borderBlockEnd: `1px solid ${tokens["--border"]}`,
    marginBlockEnd: `calc(${tokens["--spacing"]} * 2)`,
  },
  heading: { overflowWrap: "anywhere", textWrap: "balance" },
  title: {
    fontSize: { default: "1.5rem", ":is(h1)": "1.5rem" },
    lineHeight: 1.3,
    fontWeight: 650,
    letterSpacing: "-0.025em",
  },
  muted: { color: tokens["--muted-foreground"] },
  small: { fontSize: "0.875rem" },
  divided: {
    borderBlockEnd: `1px solid ${tokens["--border"]}`,
    paddingBlock: `calc(${tokens["--spacing"]} * 5)`,
    overflowWrap: "anywhere",
  },
  rowGap: { gap: `calc(${tokens["--spacing"]} * 3)` },
  wrap: { flexWrap: "wrap" },
  alignCenter: { alignItems: "center" },
  preview: {
    padding: `calc(${tokens["--spacing"]} * 4)`,
    backgroundColor: tokens["--muted"],
    borderRadius: tokens["--radius-sm"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  content: {
    width: "100%",
    maxWidth: 1280,
    marginInline: "auto",
    padding: {
      default: `calc(${tokens["--spacing"]} * 7)`,
      "@media (max-width: 700px)": `calc(${tokens["--spacing"]} * 4.5)`,
    },
  },
})
