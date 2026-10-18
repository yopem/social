import * as stylex from "@stylexjs/stylex"

import { Button } from "ui/components/button"
import { Card, CardPanel } from "ui/components/card"
import { Heading } from "ui/components/heading"
import { HStack } from "ui/components/hstack"
import { Input } from "ui/components/input"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"

import type { ComposerController } from "@/features/posts/hooks/use-composer"

import { deskStyles } from "@/components/desk-styles"

export function ComposerSchedule({
  composer,
  timezone,
  scheduled,
}: {
  composer: ComposerController
  timezone: string
  scheduled: boolean
}) {
  return (
    <>
      <label htmlFor="composer-field-2" {...stylex.props(deskStyles.label)}>
        Publish at
        <Input
          id="composer-field-2"
          nativeInput
          type="datetime-local"
          value={composer.scheduled}
          disabled={composer.locked}
          onChange={(event) => composer.setScheduled(event.target.value)}
        />
      </label>
      {scheduled && (
        <Text>
          Save draft removes the current schedule. Use Schedule post to keep or
          change the publish time.
        </Text>
      )}
      <Text xstyle={[deskStyles.text, deskStyles.muted, deskStyles.small]}>
        Publish time uses {timezone}. Daylight-saving gaps and repeated times
        are rejected.
      </Text>
    </>
  )
}

export function ComposerPreview({
  composer,
}: {
  composer: ComposerController
}) {
  const { form, channels } = composer

  return (
    <form.Subscribe selector={(state) => state.values}>
      {(value) => (
        <Card render={<section />} aria-label="Post preview">
          <CardPanel>
            <Stack>
              <Heading render={<h3>Preview</h3>} />
              <Text>{value.text || "Media post"}</Text>
              <Text>{value.mediaIds.length} attachment(s)</Text>
              {value.channelIds.map((id) => (
                <Text key={id}>
                  {channels?.find((channel) => channel.id === id)
                    ?.displayName ?? id}
                  :{" "}
                  {value.overrides.find((override) => override.channelId === id)
                    ?.text ??
                    (value.text || "Media post")}
                </Text>
              ))}
            </Stack>
          </CardPanel>
        </Card>
      )}
    </form.Subscribe>
  )
}

export function ComposerActions({
  composer,
}: {
  composer: ComposerController
}) {
  const {
    locked,
    attachments,
    saving,
    uncertainSave,
    publishStarted,
    selectAction,
  } = composer

  return (
    <HStack
      xstyle={[deskStyles.rowGap, deskStyles.wrap, deskStyles.alignCenter]}
    >
      <Button
        type="submit"
        variant="outline"
        aria-busy={saving}
        disabled={locked || attachments.uploading}
        onClick={() => selectAction("draft")}
      >
        Save draft
      </Button>
      <Button
        type="submit"
        disabled={
          saving ||
          attachments.uploading ||
          uncertainSave ||
          attachments.unavailable
        }
        onClick={() => selectAction("publish")}
      >
        {publishStarted ? "Check publish result" : "Publish now"}
      </Button>
      <Button
        type="submit"
        variant="outline"
        disabled={locked || attachments.uploading || attachments.unavailable}
        onClick={() => selectAction("schedule")}
      >
        Schedule post
      </Button>
    </HStack>
  )
}
