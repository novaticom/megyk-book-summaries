'use client'

import { Box, Button } from '@mantine/core'
import { useTranslations } from 'next-intl'
import { BookTag } from '@/lib/types/books'
import styles from './TagFilter.module.css'

interface TagFilterProps {
  tags: BookTag[]
  selectedTag: string | null
  onTagSelect: (tagSlug: string | null) => void
}

export function TagFilter({ tags, selectedTag, onTagSelect }: TagFilterProps) {
  const t = useTranslations('carousel');
  const tTags = useTranslations('tags');

  const handleTagClick = (tagSlug: string | null) => {
    // If clicking the already selected tag, toggle it off (go back to "All")
    if (tagSlug === selectedTag) {
      onTagSelect(null)
    } else {
      onTagSelect(tagSlug)
    }
  }

  return (
    <Box className={styles.tagContainer}>
      <Button
        variant={selectedTag === null ? 'filled' : 'light'}
        color="blue"
        size="sm"
        radius="xl"
        className={styles.tagPill}
        onClick={() => handleTagClick(null)}
      >
        {t('all')}
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
          {tTags.has(tag.name) ? tTags(tag.name as any) : tag.name}
        </Button>
      ))}
    </Box>
  )
}
