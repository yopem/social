import * as stylex from "@stylexjs/stylex"
import { useQuery } from "@tanstack/react-query"
import { Effect, Schema } from "effect"
import { useId, useState } from "react"

import type { Channel } from "rpc/contracts/channels"
import type { Media } from "rpc/contracts/media"
import type { PlatformOverride } from "rpc/contracts/posts"
import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Card, CardHeader, CardTitle, CardPanel } from "ui/components/card"
import { Field, FieldDescription, FieldLabel } from "ui/components/field"
import { HStack } from "ui/components/hstack"
import { Input } from "ui/components/input"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"
import { Textarea } from "ui/components/textarea"

import { deskStyles } from "@/components/desk-styles"
import { Check, Choice, Failure } from "@/components/desk-ui"
import { workspaceQuery } from "@/lib/queries"

const booleanChoices = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
]

export function TargetOptions({
  channel,
  value,
  onChange,
  media,
  disabled = false,
}: {
  channel: Channel
  value: PlatformOverride
  onChange: (value: PlatformOverride) => void
  media: readonly Media[]
  disabled?: boolean
}) {
  const titleId = useId()
  const [expanded, setExpanded] = useState(false)

  function update(patch: Partial<PlatformOverride>) {
    onChange({ ...value, ...patch })
  }

  return (
    <Card render={<section />} aria-label={`${channel.displayName} options`}>
      <CardPanel>
        <Stack>
          <Field>
            <FieldLabel>Text override for {channel.displayName}</FieldLabel>
            <Textarea
              rows={3}
              maxLength={100_000}
              disabled={disabled}
              value={value.text ?? ""}
              onChange={(event) => {
                const { text: _text, ...options } = value

                const next = { ...options, creatorConsent: false }

                onChange(
                  event.target.value.trim()
                    ? { ...next, text: event.target.value }
                    : next,
                )
              }}
            />
            <FieldDescription>
              Optional. Leave blank to use the shared post text.
            </FieldDescription>
          </Field>
          {channel.platform === "tiktok" && (
            <>
              <HStack>
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => setExpanded(!expanded)}
                  aria-expanded={expanded}
                >
                  TikTok options
                </Button>
              </HStack>
              {expanded && (
                <TikTokOptions
                  channel={channel}
                  value={value}
                  onChange={onChange}
                  media={media}
                  disabled={disabled}
                />
              )}
            </>
          )}
          {(channel.platform === "youtube" ||
            channel.platform === "linkedin") && (
            <>
              {channel.platform === "youtube" && (
                <>
                  <label htmlFor={titleId} {...stylex.props(deskStyles.label)}>
                    YouTube title
                    <Input
                      id={titleId}
                      disabled={disabled}
                      value={value.title ?? ""}
                      onChange={(event) =>
                        update({ title: event.target.value })
                      }
                    />
                  </label>
                  <Choice
                    disabled={disabled}
                    label="Made for kids"
                    value={
                      value.madeForKids === undefined
                        ? ""
                        : String(value.madeForKids)
                    }
                    options={booleanChoices}
                    onChange={(choice) =>
                      update({ madeForKids: choice === "true" })
                    }
                  />
                  <Text>
                    Video is required. Choose the audience before publishing.
                  </Text>
                </>
              )}
              <Choice
                disabled={disabled}
                label={`${channel.platform === "youtube" ? "YouTube" : "LinkedIn"} visibility`}
                value={value.visibility ?? ""}
                options={(channel.platform === "youtube"
                  ? ["public", "private", "unlisted"]
                  : ["public"]
                ).map((visibility) => ({
                  value: visibility,
                  label: visibility,
                }))}
                onChange={(visibility) => {
                  if (
                    visibility === "public" ||
                    visibility === "private" ||
                    visibility === "unlisted"
                  )
                    update({ visibility })
                }}
              />
            </>
          )}
        </Stack>
      </CardPanel>
    </Card>
  )
}

export function TikTokOptions({
  channel,
  value,
  onChange,
  media,
  disabled = false,
}: {
  channel: Channel
  value: PlatformOverride
  onChange: (value: PlatformOverride) => void
  media: readonly Media[]
  disabled?: boolean
}) {
  const query = useQuery(
    workspaceQuery(
      channel.workspaceId,
      "creator",
      (client) =>
        Effect.gen(function* () {
          const data = yield* client.TikTokCreatorInfo({
            workspaceId: channel.workspaceId,
            channelId: channel.id,
          })

          const creator = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              accountId: Schema.String,
              backend: Schema.String,
              fetchedAt: Schema.String,
              username: Schema.String,
              nickname: Schema.String,
              privacyLevels: Schema.Array(Schema.String),
              commentDisabled: Schema.Boolean,
              duetDisabled: Schema.Boolean,
              stitchDisabled: Schema.Boolean,
              maxVideoDurationSeconds: Schema.Number,
            }),
          )(data)

          return { creator, data }
        }),
      channel.id,
    ),
  )

  const creator = query.data?.creator

  const privacyLevels = creator?.privacyLevels ?? []

  function update(patch: Partial<PlatformOverride>) {
    onChange({
      ...value,
      ...patch,
      creatorInfo: query.data?.data,
      creatorConsent: false,
    })
  }

  const fields = [
    {
      label: "Comments",
      key: "disableComment",
      restricted: creator?.commentDisabled === true,
      inverted: true,
    },
    {
      label: "Duet",
      key: "disableDuet",
      restricted: creator?.duetDisabled === true,
      inverted: true,
    },
    {
      label: "Stitch",
      key: "disableStitch",
      restricted: creator?.stitchDisabled === true,
      inverted: true,
    },
    {
      label: "Branded content",
      key: "brandedContent",
      restricted: false,
      inverted: false,
    },
    { label: "Own brand", key: "ownBrand", restricted: false, inverted: false },
    {
      label: "AI-generated content",
      key: "aiGenerated",
      restricted: false,
      inverted: false,
    },
    {
      label: "Delivery mode",
      key: "draft",
      restricted: false,
      inverted: false,
    },
  ] as const

  return (
    <Card render={<section />} aria-label="TikTok creator settings">
      <CardHeader>
        <CardTitle render={<h3>Creator preview</h3>} />
      </CardHeader>
      <CardPanel>
        <Stack>
          <Failure error={query.error} />
          {query.isError && (
            <HStack>
              <Button
                variant="outline"
                disabled={disabled || query.isFetching}
                onClick={() => void query.refetch()}
              >
                Retry creator information
              </Button>
            </HStack>
          )}
          {query.isPending && (
            <Box render={<output />}>Loading creator information…</Box>
          )}
          {creator && (
            <>
              <Text>
                {creator.nickname} @{creator.username}
              </Text>
              <Text>Creator avatar unavailable.</Text>
              <Text>
                Maximum video duration: {creator.maxVideoDurationSeconds}{" "}
                seconds.
              </Text>
            </>
          )}
          <Choice
            label="Privacy level"
            value={value.privacyLevel ?? ""}
            options={privacyLevels.map((level) => ({
              value: level,
              label: level,
            }))}
            disabled={disabled || !creator}
            onChange={(privacyLevel) => update({ privacyLevel })}
          />
          {fields.map((field) => (
            <Stack key={field.key}>
              <Choice
                label={field.label}
                value={
                  value[field.key] === undefined
                    ? ""
                    : String(
                        field.inverted ? !value[field.key] : value[field.key],
                      )
                }
                options={
                  field.key === "draft"
                    ? [
                        { value: "false", label: "Publish" },
                        { value: "true", label: "Upload draft" },
                      ]
                    : booleanChoices.map((choice) => ({
                        ...choice,
                        disabled: field.restricted && choice.value === "true",
                      }))
                }
                disabled={disabled || !creator}
                onChange={(choice) =>
                  update({
                    [field.key]: field.inverted
                      ? choice !== "true"
                      : choice === "true",
                  })
                }
              />
              {field.restricted && (
                <Text>
                  {field.label} unavailable for this creator. Select No.
                </Text>
              )}
            </Stack>
          ))}
          {media.length > 0 && media.every((item) => item.kind === "image") && (
            <Choice
              disabled={disabled}
              label="Photo cover"
              value={
                value.photoCoverIndex === undefined
                  ? ""
                  : String(value.photoCoverIndex)
              }
              options={media.map((item, index) => ({
                value: String(index),
                label: item.name,
              }))}
              onChange={(choice) => update({ photoCoverIndex: Number(choice) })}
            />
          )}
          <Check
            label="I approve publishing to this TikTok account"
            checked={value.creatorConsent === true}
            disabled={disabled || !creator}
            onChange={(creatorConsent) =>
              onChange({
                ...value,
                creatorConsent,
                creatorInfo: query.data?.data,
              })
            }
          />
          <Text>
            Review the post and creator choices before approval. Changing
            content requires new approval.
          </Text>
        </Stack>
      </CardPanel>
    </Card>
  )
}
