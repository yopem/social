import * as stylex from "@stylexjs/stylex"
import { useQuery } from "@tanstack/react-query"
import { Schema } from "effect"
import { useState } from "react"

import type { Channel, Media, PlatformOverride } from "rpc/contracts/models"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Heading } from "ui/components/ui/heading"
import { Input } from "ui/components/ui/input"
import { Text } from "ui/components/ui/text"

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
}: {
  channel: Channel
  value: PlatformOverride
  onChange: (value: PlatformOverride) => void
  media: readonly Media[]
}) {
  const [expanded, setExpanded] = useState(false)

  function update(patch: Partial<PlatformOverride>) {
    onChange({ ...value, ...patch })
  }

  if (channel.platform === "tiktok")
    return (
      <>
        <Button
          variant="outline"
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
          />
        )}
      </>
    )

  if (channel.platform !== "youtube" && channel.platform !== "linkedin")
    return null

  return (
    <Box
      render={<section />}
      aria-label={`${channel.displayName} options`}
      xstyle={deskStyles.stack}
    >
      {channel.platform === "youtube" && (
        <>
          <label
            htmlFor="target-options-field-1"
            {...stylex.props(deskStyles.label)}
          >
            YouTube title
            <Input
              id="target-options-field-1"
              value={value.title ?? ""}
              onChange={(event) => update({ title: event.target.value })}
            />
          </label>
          <Choice
            label="Made for kids"
            value={
              value.madeForKids === undefined ? "" : String(value.madeForKids)
            }
            options={booleanChoices}
            onChange={(choice) => update({ madeForKids: choice === "true" })}
          />
          <Text>Video is required. Choose the audience before publishing.</Text>
        </>
      )}
      <Choice
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
    </Box>
  )
}

export function TikTokOptions({
  channel,
  value,
  onChange,
  media,
}: {
  channel: Channel
  value: PlatformOverride
  onChange: (value: PlatformOverride) => void
  media: readonly Media[]
}) {
  const query = useQuery(
    workspaceQuery(
      channel.workspaceId,
      "creator",
      (client) =>
        client.TikTokCreatorInfo({
          workspaceId: channel.workspaceId,
          channelId: channel.id,
        }),
      channel.id,
    ),
  )

  const creator =
    query.data &&
    Schema.decodeUnknownSync(
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
    )(query.data)

  const privacyLevels = creator?.privacyLevels ?? []

  function update(patch: Partial<PlatformOverride>) {
    onChange({
      ...value,
      ...patch,
      creatorInfo: query.data,
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
    <Box
      render={<section />}
      aria-label="TikTok creator settings"
      xstyle={deskStyles.stack}
    >
      <Heading render={<h3>Creator preview</h3>} />
      <Failure error={query.error} />
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
        disabled={!creator}
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
            disabled={!creator}
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
        disabled={!creator}
        onChange={(creatorConsent) =>
          onChange({
            ...value,
            creatorConsent,
            creatorInfo: query.data,
          })
        }
      />
      <Text>
        Review the post and creator choices before approval. Changing content
        requires new approval.
      </Text>
    </Box>
  )
}
