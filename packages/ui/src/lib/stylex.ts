import type {
  CompiledStyles,
  InlineStyles,
  StyleXArray,
} from "@stylexjs/stylex"
import type { CSSProperties } from "react"

import * as stylex from "@stylexjs/stylex"
import { clsx } from "clsx"

export type StyleXStyle = StyleXArray<
  | null
  | undefined
  | CompiledStyles
  | boolean
  | Readonly<[CompiledStyles, InlineStyles]>
>

type InlineStyle = CSSProperties | ((state: never) => CSSProperties | undefined)

type ClassName = string | ((state: never) => string | undefined)

type CallbackOf<Value> = Value extends (
  ...args: infer Arguments
) => infer Result
  ? (...args: Arguments) => Result
  : never

export function isString<Value>(value: Value): value is Extract<Value, string> {
  // oxlint-disable-next-line quality/no-runtime-typeof -- SAFETY: primitive string check preserves the component's string-or-callback prop contract.
  return typeof value === "string"
}

export function isNumber<Value>(value: Value): value is Extract<Value, number> {
  // oxlint-disable-next-line quality/no-runtime-typeof -- SAFETY: primitive number check preserves the input size contract.
  return typeof value === "number"
}

export function isCallback<Value>(
  value: Value,
): value is Value & CallbackOf<Value> {
  // oxlint-disable-next-line quality/no-runtime-typeof -- SAFETY: callback unions require callable discrimination to preserve the public prop contract.
  return typeof value === "function"
}

interface MergeableProps {
  style?: InlineStyle
  className?: ClassName
}

export type StyleXComponentProps<
  Props,
  Own extends object = object,
> = Props extends object
  ? Omit<Props, "style" | keyof Own | keyof StyleXProps> & StyleXProps & Own
  : never

type PropValue<Props, Key extends PropertyKey> = Key extends keyof Props
  ? Props[Key]
  : undefined

type MergedClassName<Class> = [Class] extends [never]
  ? string
  : Class extends (state: infer State) => void
    ? (state: State) => string
    : string

type MergedStyle<Style> = Style extends (state: infer State) => void
  ? (state: State) => CSSProperties
  : CSSProperties

export function mergeStylexProps<
  Generated extends { style?: CSSProperties; className?: ClassName },
  Props extends object,
>(
  generated: Generated,
  props: Props & MergeableProps,
): Omit<Generated, keyof Props | "style" | "className"> &
  Omit<Props, "style" | "className"> & {
    style: MergedStyle<PropValue<Props, "style">>
    className: MergedClassName<
      | Extract<Generated["className"], ClassName>
      | Extract<PropValue<Props, "className">, ClassName>
    >
  }
export function mergeStylexProps(
  generated: { style?: CSSProperties; className?: ClassName },
  props: MergeableProps,
) {
  const { style, className } = props
  const generatedClassName = generated.className

  return {
    ...generated,
    ...props,
    className:
      isCallback(generatedClassName) || isCallback(className)
        ? function mergedClassName(state: never) {
            return clsx(
              isCallback(generatedClassName)
                ? generatedClassName(state)
                : generatedClassName,
              isCallback(className) ? className(state) : className,
            )
          }
        : clsx(generatedClassName, className),
    style: isCallback(style)
      ? function mergedStyle(state: never) {
          return { ...generated.style, ...style(state) }
        }
      : { ...generated.style, ...style },
  }
}

export interface StyleXProps {
  /** The component applies these StyleX styles after its defaults and variants. */
  xstyle?: StyleXStyle
}

export function stylexProps(
  className: string | undefined,
  ...styles: readonly StyleXStyle[]
): {
  className: string
  style: ReturnType<typeof stylex.props>["style"] | undefined
}
export function stylexProps<State>(
  className: string | ((state: State) => string | undefined) | undefined,
  ...styles: readonly StyleXStyle[]
): {
  className: string | ((state: State) => string)
  style: ReturnType<typeof stylex.props>["style"] | undefined
}
export function stylexProps<State>(
  className: string | ((state: State) => string | undefined) | undefined,
  ...styles: readonly StyleXStyle[]
) {
  const props = stylex.props(...styles)

  const style =
    props.style && Object.keys(props.style).length > 0 ? props.style : undefined

  return {
    ...props,
    style,
    className: isCallback(className)
      ? (state: State) => clsx(props.className, className(state))
      : clsx(props.className, className),
  }
}
