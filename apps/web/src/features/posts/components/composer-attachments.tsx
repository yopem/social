import * as stylex from "@stylexjs/stylex"

import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { HStack } from "ui/components/hstack"
import { Input } from "ui/components/input"

import type { ComposerController } from "@/features/posts/hooks/use-composer"

import { deskStyles } from "@/components/desk-styles"
import { Failure } from "@/components/desk-ui"

export function ComposerAttachments({
  composer,
}: {
  composer: ComposerController
}) {
  const { attachments, locked, removeMedia, uploadFile } = composer

  return (
    <>
      <label htmlFor="composer-field-1" {...stylex.props(deskStyles.label)}>
        Add images or video
        <Input
          id="composer-field-1"
          nativeInput
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          disabled={locked || attachments.uploading}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.currentTarget.value = ""

            if (file) uploadFile(file)
          }}
        />
      </label>
      <Failure error={attachments.uploadError} />
      {attachments.uploading && <Box render={<output />}>Uploading media…</Box>}
      {attachments.media.map((item) => (
        <HStack
          key={item.id}
          xstyle={[deskStyles.rowGap, deskStyles.wrap, deskStyles.alignCenter]}
        >
          <a href={item.url} target="_blank" rel="noreferrer">
            {item.name}
          </a>
          <Button
            variant="ghost"
            disabled={locked}
            onClick={() => removeMedia(item.id)}
          >
            Remove {item.name}
          </Button>
        </HStack>
      ))}
      {attachments.unavailableIds.map((id) => (
        <HStack key={id}>
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => removeMedia(id)}
          >
            Remove unavailable attachment {id}
          </Button>
        </HStack>
      ))}
      <Failure error={attachments.error} />
      {attachments.loading && (
        <Box render={<output />}>Loading saved attachments…</Box>
      )}
      {attachments.failed && (
        <HStack>
          <Button variant="outline" onClick={attachments.retryMedia}>
            Retry attachments
          </Button>
        </HStack>
      )}
    </>
  )
}
