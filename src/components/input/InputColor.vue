<template>
	<input class="InputColor" type="text" :value="value" @input="onInput" />
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import {MalVal} from '@/mal/types'
import {printExp} from '@/mal'

@Component({
	name: 'InputColor'
})
export default class InputColor extends Vue {
	@Prop({type: String, required: true}) private value!: MalVal

	onInput(e: InputEvent) {
		const val = (e.target as HTMLInputElement).value
		this.$emit('input', val)
	}
}
</script>

<style lang="stylus" scoped>
.InputColor
	width 8rem
	border none
	border-bottom 1px dashed var(--comment)
	background var(--background)
	color var(--green)
</style>