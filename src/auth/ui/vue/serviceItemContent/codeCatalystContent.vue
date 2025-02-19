<template>
    <div class="service-item-content-container border-common" v-show="isAllAuthsLoaded">
        <div class="service-item-content-container-title">Amazon CodeCatalyst</div>

        <div class="centered-items">
            <img
                class="service-item-content-image"
                src="https://github.com/aws/aws-toolkit-vscode/raw/HEAD/docs/marketplace/vscode/CC_dev_env.gif"
                alt="CodeCatalyst example GIF"
            />
        </div>

        <div>
            Amazon CodeCatalyst, is a cloud-based collaboration space for software development teams. You can create a
            project that will generate resources that you can manage, including Dev Environments and workflows. Through
            the AWS Toolkit for Visual Studio Code, you can view and manage your CodeCatalyst resources directly from VS
            Code.
        </div>

        <div>
            <a href="https://aws.amazon.com/codecatalyst/" v-on:click="emitUiClick('auth_learnMoreCodeCatalyst')"
                >Learn more about CodeCatalyst.</a
            >
        </div>

        <hr />

        <div class="service-item-content-form-section">
            <div class="service-item-content-form-container">
                <BuilderIdForm
                    :state="builderIdState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                ></BuilderIdForm>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import BuilderIdForm, { CodeCatalystBuilderIdState } from '../authForms/manageBuilderId.vue'
import BaseServiceItemContent from './baseServiceItemContent.vue'
import authFormsState, { AuthForm, FeatureStatus } from '../authForms/shared.vue'
import { AuthFormId } from '../authForms/types'
import { ConnectionUpdateArgs } from '../authForms/baseAuth.vue'

export default defineComponent({
    name: 'CodeCatalystContent',
    components: { BuilderIdForm },
    extends: BaseServiceItemContent,
    data() {
        return {
            isLoaded: {
                builderIdCodeCatalyst: false,
            } as Record<AuthFormId, boolean>,
            isAllAuthsLoaded: false,
        }
    },
    computed: {
        builderIdState(): CodeCatalystBuilderIdState {
            return authFormsState.builderIdCodeCatalyst
        },
    },
    methods: {
        updateIsAllAuthsLoaded() {
            const hasUnloaded = Object.values(this.isLoaded).filter(val => !val).length > 0
            this.isAllAuthsLoaded = !hasUnloaded
        },
        async onAuthConnectionUpdated(args: ConnectionUpdateArgs) {
            this.isLoaded[args.id] = true
            this.updateIsAllAuthsLoaded()
            this.emitAuthConnectionUpdated('codecatalyst', args)
        },
    },
})

export class CodeCatalystContentState extends FeatureStatus {
    override getAuthForms(): AuthForm[] {
        return [authFormsState.builderIdCodeCatalyst]
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
