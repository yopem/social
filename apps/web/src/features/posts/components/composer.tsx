import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "ui/components/dialog"

import { ComposerForm } from "@/features/posts/components/composer-form"
import {
  useComposer,
  type ComposerProps,
} from "@/features/posts/hooks/use-composer"

export function Composer({ workspace, post, onClose }: ComposerProps) {
  const composer = useComposer({ workspace, post, onClose })

  return (
    <Dialog open onOpenChange={composer.changeOpen}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Edit post</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <ComposerForm
            composer={composer}
            timezone={workspace.timezone}
            scheduled={Boolean(post?.scheduledAt)}
          />
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}
