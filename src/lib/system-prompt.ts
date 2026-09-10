import { prisma } from '@/lib/db';

/** There is only one profile, so its name is not a choice an admin makes. */
export const DEFAULT_PROFILE_NAME = 'Advisor profile';

/**
 * Which advisor profile is in force, and how it is written.
 *
 * One function, because there were two: the chat path asked Prisma for the
 * first row with `isActive`, and the admin editor asked with its own ordering.
 * Nothing guaranteed they agreed, so an admin could be editing one profile
 * while the model was being sent another, with nothing on screen saying so.
 * On a tool that states statutory deadlines that is the worst shape of wrong:
 * silent, and plausible.
 *
 * The database now refuses a second active row (see the partial unique index
 * in `20260910_one_active_system_prompt`). The ordering below is what resolves
 * a row written before that index existed, and is deterministic so that both
 * callers resolve it the same way.
 */
export async function findActiveProfile() {
  return prisma.systemPrompt.findFirst({
    where: { isActive: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
}

export interface SavedProfile {
  id: string;
  content: string;
  previousContent: string | null;
  isActive: boolean;
  updatedAt: Date;
  contentChanged: boolean;
}

/**
 * Write the one advisor profile, creating it only if the table is empty.
 *
 * The editor used to POST whenever it held no active profile, which is not the
 * same condition as "no profile exists" -- a row can be left inactive by a
 * deactivation, and the single-profile UI shows no list -- so every save in
 * that state minted another row that nobody could reach and that `findFirst`
 * could later pick up.
 *
 * All of it in one transaction: deactivating the others and activating this
 * one were separate statements, and two concurrent writes could interleave
 * into two active rows.
 */
export async function saveActiveProfile(
  content: string,
  name: string = DEFAULT_PROFILE_NAME
): Promise<SavedProfile> {
  return prisma.$transaction(async tx => {
    const existing =
      (await tx.systemPrompt.findFirst({
        where: { isActive: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      })) ??
      (await tx.systemPrompt.findFirst({ orderBy: { updatedAt: 'desc' } }));

    if (!existing) {
      const created = await tx.systemPrompt.create({
        data: { name, content, isActive: true },
      });
      return { ...created, contentChanged: false };
    }

    await tx.systemPrompt.updateMany({
      where: { isActive: true, id: { not: existing.id } },
      data: { isActive: false },
    });

    // `previousContent` moves only when the text actually changes: activating
    // a dormant row, or renaming it, must not consume the one undo an admin
    // has.
    const contentChanged = content !== existing.content;
    const updated = await tx.systemPrompt.update({
      where: { id: existing.id },
      data: {
        content,
        isActive: true,
        ...(contentChanged && { previousContent: existing.content }),
      },
    });

    return { ...updated, contentChanged };
  });
}
