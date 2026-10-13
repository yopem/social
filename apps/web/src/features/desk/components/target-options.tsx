import * as stylex from "@stylexjs/stylex"
import { useQuery } from "@tanstack/react-query"
import { Effect, Schema } from "effect"
import { useId, useState } from "react"

import type { Channel, Media, PlatformOverride } from "rpc/contracts/models"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "ui/components/ui/field"
import { Heading } from "ui/components/ui/heading"
import { Input } from "ui/components/ui/input"
import { Stack } from "ui/components/ui/stack"
import { Text } from "ui/components/ui/text"
import { Textarea } from "ui/components/ui/textarea"

import { Check, Choice, Failure, deskStyles } from "@/components/desk-ui"
import { workspaceQuery } from "@/features/desk/queries"

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
    <Stack render={<section />} aria-label={`${channel.displayName} options`}>
      <Field>
        <FieldLabel>Text override for {channel.displayName}</FieldLabel>
        <Textarea
          rows={3}
          maxLength={100_000}
          disabled={disabled}
          value={value.text ?? ""}
          onChange={(event) =>
            update({
              text: event.target.value.trim() ? event.target.value : undefined,
              creatorConsent: false,
            })
          }
        />
        <FieldDescription>
          Optional. Leave blank to use the shared post text.
        </FieldDescription>
      </Field>
      {channel.platform === "tiktok" && (
        <>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            TikTok options
          </Button>
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
      {(channel.platform === "youtube" || channel.platform === "linkedin") && (
        <>
          {channel.platform === "youtube" && (
            <>
              <label htmlFor={titleId} {...stylex.props(deskStyles.label)}>
                YouTube title
                <Input
                  id={titleId}
                  disabled={disabled}
                  value={value.title ?? ""}
                  onChange={(event) => update({ title: event.target.value })}
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
            ).map((visibility) => ({ value: visibility, label: visibility }))}
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
    <Stack render={<section />} aria-label="TikTok creator settings">
      <Heading render={<h3>Creator preview</h3>} />
      <Failure error={query.error} />
      {query.isError && (
        <Button
          variant="outline"
          disabled={disabled || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Retry creator information
        </Button>
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
            Maximum video duration: {creator.maxVideoDurationSeconds} seconds.
          </Text>
        </>
      )}
      <Choice
        label="Privacy level"
        value={value.privacyLevel ?? ""}
        options={privacyLevels.map((level) => ({ value: level, label: level }))}
        disabled={disabled || !creator}
        onChange={(privacyLevel) => update({ privacyLevel })}
      />
      {fields.map((field) => (
        <Box key={field.key}>
          <Choice
            label={field.label}
            value={
              value[field.key] === undefined
                ? ""
                : String(field.inverted ? !value[field.key] : value[field.key])
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
            <Text>{field.label} unavailable for this creator. Select No.</Text>
          )}
        </Box>
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
        Review the post and creator choices before approval. Changing content
        requires new approval.
      </Text>
    </Stack>
  )
}
