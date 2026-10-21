import * as stylex from "@stylexjs/stylex"
import { ImagePlusIcon } from "lucide-react"
import { useId, useState } from "react"

import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Card, CardPanel } from "ui/components/card"
import { Heading } from "ui/components/heading"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"
import { Wrap } from "ui/components/wrap"
import { tokens } from "ui/styles/tokens.stylex"

import type { ComposerController } from "@/features/posts/hooks/use-composer"

import { deskStyles } from "@/components/desk-styles"
import { Failure } from "@/components/desk-ui"

const styles = stylex.create({
  drop: {
    position: "relative",
    display: "grid",
    gap: `calc(${tokens["--spacing"]} * 3)`,
    justifyItems: "center",
    textAlign: "center",
    padding: `calc(${tokens["--spacing"]} * 8)`,
    border: `2px dashed ${tokens["--border"]}`,
    borderRadius: tokens["--radius-lg"],
    backgroundColor: tokens["--muted"],
    outline: {
      default: "none",
      ":focus-within": `2px solid ${tokens["--ring"]}`,
    },
    outlineOffset: 4,
  },
  dragging: {
    borderColor: tokens["--primary"],
    backgroundColor: tokens["--accent"],
  },
  picker: {
    position: "absolute",
    inset: 0,
    opacity: 0,
    inlineSize: "100%",
    blockSize: "100%",
    cursor: "pointer",
  },
  preview: {
    inlineSize: "100%",
    maxBlockSize: 240,
    objectFit: "contain",
    borderRadius: tokens["--radius-sm"],
    backgroundColor: tokens["--muted"],
  },
})

function formatAttachmentSize(bytes: number) {
  if (bytes < 1000) return `${bytes} B`

  const unit = bytes < 1000000 ? "KB" : "MB"
  const size = bytes / (bytes < 1000000 ? 1000 : 1000000)

  return `${size.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`
}

export function ComposerAttachments({
  composer,
}: {
  composer: ComposerController
}) {
  const { attachments, locked, removeMedia, uploadFiles } = composer
  const id = useId()
  const [dragging, setDragging] = useState(false)
  const disabled = locked || attachments.uploading

  return (
    <Stack>
      <Heading render={<h2>Media</h2>} />
      <label
        htmlFor={id}
        {...stylex.props(styles.drop, dragging && styles.dragging)}
      >
        <ImagePlusIcon size={28} aria-hidden="true" />
        <Box render={<span id={`${id}-label`} />}>
          Drop images or videos here, or choose files
        </Box>
        <small
          id={`${id}-help`}
          {...stylex.props(deskStyles.text, deskStyles.muted)}
        >
          JPEG, PNG, GIF or WebP up to 10 MB. MP4, MOV or WebM up to 100 MB. Up
          to 20 attachments. Channel limits can differ.
        </small>
        <input
          {...stylex.props(styles.picker)}
          id={id}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-help`}
          disabled={disabled}
          onDragOver={(event) => {
            event.preventDefault()

            if (!disabled) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)

            if (!disabled) uploadFiles(Array.from(event.dataTransfer.files))
          }}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ""
            uploadFiles(files)
          }}
        />
      </label>
      <Box aria-live="polite" aria-atomic="true">
        {attachments.uploading && (
          <Text>Uploading {attachments.activeFile}… Keep this page open.</Text>
        )}
        {!attachments.uploading && attachments.media.length > 0 && (
          <Text>{attachments.media.length} attachment(s) ready</Text>
        )}
      </Box>
      {attachments.uploadErrors.length > 0 && (
        <Box role="alert">
          <Stack>
            {attachments.uploadErrors.map((message) => (
              <Text key={message} xstyle={deskStyles.danger}>
                {message}
              </Text>
            ))}
            <Text>
              Choose the failed files again to retry. Uploaded files are kept.
            </Text>
          </Stack>
        </Box>
      )}
      {attachments.media.map((item) => (
        <Card key={item.id}>
          <CardPanel>
            <Stack>
              {item.kind === "image" ? (
                <img
                  {...stylex.props(styles.preview)}
                  src={item.url}
                  alt={item.name}
                />
              ) : (
                <video
                  {...stylex.props(styles.preview)}
                  src={item.url}
                  controls
                  preload="metadata"
                  aria-label={item.name}
                >
                  <track kind="captions" />
                </video>
              )}
              <Wrap>
                <Stack>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.name}
                  </a>
                  <Text xstyle={[deskStyles.text, deskStyles.muted]}>
                    {formatAttachmentSize(item.bytes)}
                  </Text>
                </Stack>
                <Button
                  variant="ghost"
                  disabled={disabled}
                  aria-label={`Remove ${item.name}`}
                  onClick={() => removeMedia(item.id)}
                >
                  Remove
                </Button>
              </Wrap>
            </Stack>
          </CardPanel>
        </Card>
      ))}
      {attachments.unavailableIds.map((mediaId) => (
        <Button
          key={mediaId}
          variant="outline"
          disabled={disabled}
          onClick={() => removeMedia(mediaId)}
        >
          Remove unavailable attachment {mediaId}
        </Button>
      ))}
      <Failure error={attachments.error} />
      {attachments.loading && <Text>Loading saved attachments…</Text>}
      {attachments.failed && (
        <HStack>
          <Button variant="outline" onClick={attachments.retryMedia}>
            Retry attachments
          </Button>
        </HStack>
      )}
    </Stack>
  )
}
