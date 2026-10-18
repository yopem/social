import { HashSet } from "effect"

import { Button } from "ui/components/button"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"

import type { ComposerController } from "@/features/posts/hooks/use-composer"

import { Check, Failure } from "@/components/desk-ui"
import { TargetOptions } from "@/features/posts/components/target-options"

export function ComposerTargets({
  composer,
}: {
  composer: ComposerController
}) {
  const { form, channels, locked, selectedTargetIds, rememberCreator } =
    composer

  return (
    <>
      <Failure error={composer.channelsError} />
      <HStack>
        <Button
          variant="ghost"
          disabled={composer.refreshingChannels}
          onClick={composer.retryChannels}
        >
          {composer.channelsFailed ? "Retry channels" : "Refresh channels"}
        </Button>
      </HStack>
      {channels
        ?.filter(
          (channel) =>
            channel.status === "connected" ||
            HashSet.has(selectedTargetIds, channel.id),
        )
        .map((channel) => (
          <form.Field key={channel.id} name="channelIds">
            {(field) => (
              <Stack>
                <Check
                  label={channel.displayName}
                  checked={field.state.value.includes(channel.id)}
                  disabled={
                    locked ||
                    (channel.status !== "connected" &&
                      !field.state.value.includes(channel.id))
                  }
                  onChange={(checked) => {
                    field.handleChange(
                      checked
                        ? [...field.state.value, channel.id]
                        : field.state.value.filter((id) => id !== channel.id),
                    )

                    if (!checked)
                      form.setFieldValue("overrides", (overrides) =>
                        overrides.filter(
                          (override) => override.channelId !== channel.id,
                        ),
                      )
                  }}
                />
                {field.state.value.includes(channel.id) && (
                  <form.Field name="overrides">
                    {(overrides) => (
                      <TargetOptions
                        channel={channel}
                        disabled={locked}
                        value={
                          overrides.state.value.find(
                            (override) => override.channelId === channel.id,
                          ) ?? { channelId: channel.id }
                        }
                        media={composer.attachments.media}
                        onChange={({ creatorInfo, ...value }) => {
                          if (creatorInfo)
                            rememberCreator(channel.id, creatorInfo)
                          overrides.handleChange([
                            ...overrides.state.value.filter(
                              (override) => override.channelId !== channel.id,
                            ),
                            value,
                          ])
                        }}
                      />
                    )}
                  </form.Field>
                )}
              </Stack>
            )}
          </form.Field>
        ))}
      <form.Field name="channelIds">
        {(field) => (
          <>
            {field.state.value
              .filter(
                (id) =>
                  channels && !channels.some((channel) => channel.id === id),
              )
              .map((id) => (
                <HStack key={id}>
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() => {
                      field.handleChange(
                        field.state.value.filter((item) => item !== id),
                      )
                      form.setFieldValue("overrides", (overrides) =>
                        overrides.filter(
                          (override) => override.channelId !== id,
                        ),
                      )
                    }}
                  >
                    Remove unavailable channel {id}
                  </Button>
                </HStack>
              ))}
          </>
        )}
      </form.Field>
      {channels?.length === 0 && (
        <Text>
          Connect a channel to publish. You can save a draft without a channel.
        </Text>
      )}
    </>
  )
}
