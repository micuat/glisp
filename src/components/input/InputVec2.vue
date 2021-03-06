<template>
	<div class="InputVec2">
		[
		<InputNumber
			class="InputVec2__el"
			:value="value[0]"
			@input="onInput(0, $event)"
		/>
		<InputNumber
			class="InputVec2__el"
			:value="value[1]"
			@input="onInput(1, $event)"
		/>]
		<button
			class="InputVec2__drag"
			:class="{dragging: drag.isDragging}"
			ref="dragEl"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref, Ref, PropType} from '@vue/composition-api'
import {markMalVector} from '@/mal/types'
import InputNumber from './InputNumber.vue'
import {useDraggable} from '@/components/use'

export default defineComponent({
	name: 'InputVec2',
	components: {InputNumber},
	props: {
		value: {
			type: Array as PropType<number[]>,
			required: true
		}
	},
	setup(props, context) {
		const dragEl: Ref<null | HTMLElement> = ref(null)

		const onInput = (i: number, v: number) => {
			const value = markMalVector([...props.value])
			value[i] = v

			context.emit('input', value)
		}

		const drag = useDraggable(dragEl, {
			onDrag({isDragging, deltaX, deltaY}) {
				if (!isDragging) return

				const newValue = markMalVector([...props.value]) as number[]
				newValue[0] += deltaX
				newValue[1] += deltaY
				context.emit('input', newValue)
			}
		})

		return {
			dragEl,
			onInput,
			drag
		}
	}
})
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'

.InputVec2
	display flex
	line-height $input-height

	&__el
		margin-right 0.5em
		width 5em

		&:last-child
			margin-right 0

	&__drag
		position relative
		margin-left 0.5rem
		width 14px
		height 14px
		border 1px solid var(--comment)
		border-radius 2px

		&:hover, &.dragging
			background var(--comment)

			&:before
				border-color var(--background)

		&:before
			position absolute
			display block
			border 1px solid var(--comment)
			content ''

		&:before
			top 3px
			left 3px
			width 6px
			height 6px
			border-radius 50%
</style>
