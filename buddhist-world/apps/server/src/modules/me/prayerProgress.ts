import { z } from "zod";

export const prayerProgressBody = z.object({
  count: z.number().int().min(0).max(216),
  target: z.union([z.literal(27), z.literal(54), z.literal(108), z.literal(216)]),
  sessions: z.number().int().min(0).max(10_000_000),
  lastSessionAt: z.string().datetime({ offset: true }).nullable(),
}).strict().superRefine((value, context) => {
  if (value.count > value.target) {
    context.addIssue({
      code: "custom",
      path: ["count"],
      message: "Số câu niệm không được vượt mục tiêu.",
    });
  }
});

export type PrayerProgressInput = z.infer<typeof prayerProgressBody>;
