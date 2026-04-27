export const max_post_tags = 5;
export const max_post_tag_length = 30; // Added max length constant

const post_hashtag_pattern = /#([\p{L}\p{N}_]+)/gu;

function cleanup_post_text(content: string): string {
    return content
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+([.,!?;:])/g, '$1')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .trim();
}

export function normalize_post_tag(raw_tag: unknown): string | null {
    if (typeof raw_tag !== 'string') {
        return null;
    }

    const normalized = raw_tag.trim().toLowerCase().replace(/^#+/, '');
    
    // Check if it's a valid tag first
    if (!/^[\p{L}\p{N}_]+$/u.test(normalized)) {
        return null;
    }

    // Truncate the tag to the maximum allowed characters
    return normalized.slice(0, max_post_tag_length);
}

export function limit_post_tags(tags: Iterable<unknown>): string[] {
    const limited_tags: string[] = [];
    const seen_tags = new Set<string>();

    for (const raw_tag of tags) {
        const normalized_tag = normalize_post_tag(raw_tag);
        if (!normalized_tag || seen_tags.has(normalized_tag)) {
            continue;
        }

        seen_tags.add(normalized_tag);
        limited_tags.push(normalized_tag);

        if (limited_tags.length >= max_post_tags) {
            break;
        }
    }

    return limited_tags;
}

export function extract_post_tags(content: string): string[] {
    const hashtags = Array.from(content.matchAll(post_hashtag_pattern), (match) => match[1]);
    return limit_post_tags(hashtags);
}

export function strip_detected_tags_from_content(raw_content: string): string {
    const detected_tags = extract_post_tags(raw_content);

    if (detected_tags.length === 0) {
        return cleanup_post_text(raw_content);
    }

    const detected_tag_set = new Set(detected_tags);
    const content_with_extra_tags = raw_content.replace(post_hashtag_pattern, (full_match, raw_tag: string) => {
        const normalized_tag = normalize_post_tag(raw_tag);
        if (!normalized_tag || !detected_tag_set.has(normalized_tag)) {
            return full_match;
        }

        return '';
    });

    return cleanup_post_text(content_with_extra_tags);
}