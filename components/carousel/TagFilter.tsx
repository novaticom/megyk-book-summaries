'use client'

import { Group, Button, ScrollArea } from '@mantine/core'
import { BookTag } from '@/lib/types/books'
import styles from './TagFilter.module.css'

interface TagFilterProps {
  tags: BookTag[]
  selectedTag: string | null
  onTagSelect: (tagSlug: string | null) => void
}

export function TagFilter({ tags, selectedTag, onTagSelect }: TagFilterProps) {
  const handleTagClick = (tagSlug: string | null) => {
    // If clicking the already selected tag, toggle it off (go back to "All")
    if (tagSlug === selectedTag) {
      onTagSelect(null)
    } else {
      onTagSelect(tagSlug)
    }
  }

  return (
    <ScrollArea
      type="scroll"
      scrollbarSize={6}
      offsetScrollbars
      className={styles.scrollArea}
    >
      <Group gap="xs" wrap="nowrap" className={styles.tagGroup}>
        <Button
          variant={selectedTag === null ? 'filled' : 'light'}
          color="blue"
          size="sm"
          radius="xl"
          className={styles.tagPill}
          onClick={() => handleTagClick(null)}
        >
          All
        </Button>
        {tags.map((tag) => (
          <Button
            key={tag.id}
            variant={selectedTag === tag.slug ? 'filled' : 'light'}
            color="blue"
            size="sm"
            radius="xl"
            className={styles.tagPill}
            onClick={() => handleTagClick(tag.slug)}
          >
            {tag.name}
          </Button>
        ))}
      </Group>
    </ScrollArea>
  )
}
