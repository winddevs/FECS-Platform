import { intlTag } from "@lib/util/locale-format";
import type { Post } from "@payload-types";

/**
 * Formats an array of populatedAuthors from Posts into a prettified string.
 * @param authors - The populatedAuthors array from a Post.
 * @returns A prettified string of authors.
 * @example
 *
 * [Author1, Author2] becomes 'Author1 and Author2' (en) / 'Author1 và Author2' (vi)
 * [Author1, Author2, Author3] becomes 'Author1, Author2, and Author3' (en)
 *
 */
export const formatAuthors = (
  authors: NonNullable<NonNullable<Post["populatedAuthors"]>[number]>[],
  locale?: string
) => {
  // Ensure we don't have any authors without a name
  const authorNames = authors
    .map((author) => author.name)
    .filter((name): name is string => Boolean(name));

  if (authorNames.length === 0) return "";
  if (authorNames.length === 1) return authorNames[0];
  return new Intl.ListFormat(intlTag(locale), {
    style: "long",
    type: "conjunction",
  }).format(authorNames);
};
