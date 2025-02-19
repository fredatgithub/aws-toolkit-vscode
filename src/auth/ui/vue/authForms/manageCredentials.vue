<template>
    <div class="auth-form container-background border-common" id="credentials-form">
        <div>
            <FormTitle :isConnected="isConnected">IAM Credentials</FormTitle>

            <div class="form-section" v-if="isConnected">
                <button v-on:click="showResourceExplorer">Open Resource Explorer</button>
            </div>

            <div v-if="isConnected" class="form-section" v-on:click="toggleShowForm()" id="collapsible">
                <div :class="collapsibleClass"></div>
                <div>Add another profile</div>
            </div>

            <div v-if="isFormShown">
                <div class="form-section">
                    <label class="small-description"
                        >Credentials will be added to the appropriate `~/.aws/` files.</label
                    >
                    <div v-on:click="editCredentialsFile()" class="sub-text-color" style="cursor: pointer">
                        <div class="icon icon-vscode-edit edit-icon"></div>
                        Edit file directly
                    </div>
                </div>

                <div class="form-section">
                    <label class="input-title">Profile Name</label>
                    <label class="small-description">The identifier for these credentials</label>
                    <input v-model="data.profileName" type="text" :data-invalid="!!errors.profileName" />
                    <div class="small-description error-text">{{ errors.profileName }}</div>
                </div>

                <div class="form-section">
                    <label class="input-title">Access Key</label>
                    <input v-model="data.aws_access_key_id" :data-invalid="!!errors.aws_access_key_id" type="text" />
                    <div class="small-description error-text">{{ errors.aws_access_key_id }}</div>
                </div>

                <div class="form-section">
                    <label class="input-title">Secret Key</label>
                    <input
                        v-model="data.aws_secret_access_key"
                        type="password"
                        :data-invalid="!!errors.aws_secret_access_key"
                    />
                    <div class="small-description error-text">{{ errors.aws_secret_access_key }}</div>
                </div>

                <div class="form-section">
                    <button v-on:click="submitData()">Add Profile</button>
                    <div class="small-description error-text">{{ errors.submit }}</div>
                </div>
            </div>
        </div>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import BaseAuthForm, { ConnectionUpdateCause } from './baseAuth.vue'
import FormTitle from './formTitle.vue'
import { SectionName, StaticProfile, StaticProfileKeyErrorMessage } from '../../../credentials/types'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthWebview } from '../show'
import { AuthForm } from './shared.vue'
import { AuthFormId } from './types'

const client = WebviewClientFactory.create<AuthWebview>()

export default defineComponent({
    name: 'CredentialsForm',
    extends: BaseAuthForm,
    components: { FormTitle },
    props: {
        state: {
            type: Object as PropType<CredentialsState>,
            required: true,
        },
        checkIfConnected: {
            type: Boolean,
            default: true,
            // In some scenarios we want to show the form and allow setup,
            // but not care about any current identity center auth connections
            // and if they are connected or not.
        },
    },
    data() {
        return {
            data: {
                profileName: this.state.getValue('profileName'),
                aws_access_key_id: this.state.getValue('aws_access_key_id'),
                aws_secret_access_key: this.state.getValue('aws_secret_access_key'),
            },
            errors: {
                profileName: '',
                aws_access_key_id: '',
                aws_secret_access_key: '',
                submit: '',
            },
            canSubmit: false,
            isConnected: false,

            /**
             * This is for the edge case when we use an accordion and
             * need to know if we should show the form
             */
            isFormShown: false,
        }
    },
    async created() {
        await this.updateDataError('profileName')
        await this.updateDataError('aws_access_key_id')
        await this.updateDataError('aws_secret_access_key')
        this.isFormShown = this.checkIfConnected ? !(await this.state.isAuthConnected()) : true
        await this.updateSubmittableStatus()

        this.updateConnectedStatus('created')
    },
    computed: {
        /** The appropriate accordion symbol (collapsed/uncollapsed) */
        collapsibleClass() {
            return this.isFormShown ? 'icon icon-vscode-chevron-down' : 'icon icon-vscode-chevron-right'
        },
    },
    methods: {
        setNewValue(key: CredentialsDataKey, newVal: string) {
            if (newVal) {
                // Edge Case:
                // Since we allow subsequent credentials to be added,
                // we will automatically wipe the form values after success.
                // That triggers this function, but we only want to
                // indicate a new form interaction if the user adds text themselves.
                client.startAuthFormInteraction('awsExplorer', 'sharedCredentials')
            }

            // If there is an error under the submit button
            // we can clear it since there is new data
            this.errors.submit = ''

            this.state.setValue(key, newVal.trim())
            this.updateSubmittableStatus()
            this.updateDataError(key)
        },
        /** Updates the error using the current data */
        async updateDataError(key: CredentialsDataKey): Promise<void> {
            await this.state.getFormatError(key).then(error => {
                this.errors[key] = error ?? ''
            })

            client.setInvalidInputFields(this.getFieldsWithErrors())
        },
        async updateSubmittableStatus() {
            return this.state.getSubmissionErrors().then(errors => {
                this.canSubmit = errors === undefined
            })
        },
        async updateConnectedStatus(cause?: ConnectionUpdateCause) {
            return this.state.isAuthConnected().then(isConnected => {
                this.isConnected = this.checkIfConnected ? isConnected : false
                this.emitAuthConnectionUpdated({ id: 'credentials', isConnected, cause })
            })
        },
        async submitData() {
            client.startAuthFormInteraction('awsExplorer', 'sharedCredentials')

            const hasEmptyFields = this.setCannotBeEmptyErrors()
            const fieldsWithErrors = this.getFieldsWithErrors()
            if (fieldsWithErrors.length > 0) {
                client.failedAuthAttempt({
                    featureType: 'awsExplorer',
                    authType: 'sharedCredentials',
                    reason: hasEmptyFields ? 'emptyFields' : 'fieldHasError',
                    invalidInputFields: this.getFieldsWithErrors(),
                })
                return
            }

            // pre submission
            this.canSubmit = false // disable submit button

            const error = await this.state.getAuthenticationError()
            if (error) {
                this.errors.submit = error.error
                client.failedAuthAttempt({
                    featureType: 'awsExplorer',
                    authType: 'sharedCredentials',
                    reason: error.key,
                    invalidInputFields: this.getFieldsWithErrors(),
                })
                return // Do not allow submission since data fails authentication
            }

            // submission
            const successful = await this.state.submitData()

            if (successful) {
                client.successfulAuthAttempt({
                    featureType: 'awsExplorer',
                    authType: 'sharedCredentials',
                })
            }

            // post submission (successfully connected)
            this.clearFormData()
            this.isFormShown = false
            this.canSubmit = true // enable submit button
            await this.updateConnectedStatus('signIn')
        },
        /**
         * Sets the 'cannot be empty' error for each empty field
         *
         * @returns true if there was an empty field, otherwise false
         */
        setCannotBeEmptyErrors() {
            const emptyFields = Object.keys(this.data).filter(key => !this.data[key as keyof typeof this.data])
            emptyFields.forEach(fieldName => {
                this.errors[fieldName as keyof typeof this.data] = 'Cannot be empty.'
            })
            return emptyFields.length > 0
        },
        toggleShowForm() {
            this.isFormShown = !this.isFormShown
        },
        clearFormData() {
            // This indirectly clears the UI, then triggers the watch handlers
            this.data.profileName = ''
            this.data.aws_access_key_id = ''
            this.data.aws_secret_access_key = ''
        },
        editCredentialsFile() {
            client.editCredentialsFile()
            client.emitUiClick('auth_editCredentials')
        },
        showResourceExplorer() {
            client.showResourceExplorer()
        },
        /** Names of fields that have an error */
        getFieldsWithErrors(): (keyof typeof this.errors)[] {
            return Object.keys(this.errors).filter(
                key => this.errors[key as keyof typeof this.errors]
            ) as (keyof typeof this.errors)[]
        },
    },
    watch: {
        'data.profileName'(newVal) {
            this.setNewValue('profileName', newVal)
        },
        'data.aws_access_key_id'(newVal) {
            this.setNewValue('aws_access_key_id', newVal)
        },
        'data.aws_secret_access_key'(newVal) {
            this.setNewValue('aws_secret_access_key', newVal)
        },
    },
})

type CredentialsProfile = { profileName: SectionName } & StaticProfile
type CredentialsProfileOptional = Partial<CredentialsProfile>
type CredentialsProfileErrors = CredentialsProfileOptional
type CredentialsDataKey = keyof CredentialsProfile

/**
 * Manages the state of credentials data.
 */
export class CredentialsState implements AuthForm {
    private _data: CredentialsProfile

    constructor(data?: CredentialsProfile) {
        this._data = {
            profileName: '',
            aws_access_key_id: '',
            aws_secret_access_key: '',
            ...data,
        }
    }

    setValue(key: CredentialsDataKey, value: string) {
        this._data[key] = value
    }

    getValue(key: CredentialsDataKey) {
        return this._data[key]
    }

    async isAuthConnected(): Promise<boolean> {
        return await client.isCredentialConnected()
    }

    get id(): AuthFormId {
        return 'credentials'
    }

    async getFormatError(key: CredentialsDataKey): Promise<string | undefined> {
        if (key === 'profileName') {
            return client.getProfileNameError(this._data.profileName, false)
        }

        const result = await client.getCredentialFormatError(key, this._data[key])
        return result
    }

    async getSubmissionErrors(): Promise<CredentialsProfileErrors | undefined> {
        const profileNameError = await client.getProfileNameError(this._data.profileName)
        const formatErrors = await client.getCredentialsSubmissionErrors(this._data)

        // No errors for anything
        if (!profileNameError && !formatErrors) {
            return undefined
        }

        return {
            profileName: profileNameError,
            ...formatErrors,
        }
    }

    async getAuthenticationError(): Promise<StaticProfileKeyErrorMessage | undefined> {
        return client.getAuthenticatedCredentialsError(this._data)
    }

    async submitData(): Promise<boolean> {
        const submit = await client.trySubmitCredentials(this._data.profileName, this._data)
        this.clearData()
        return submit
    }

    private clearData() {
        this._data = {
            profileName: '',
            aws_access_key_id: '',
            aws_secret_access_key: '',
        }
    }
}
</script>
<style>
@import './sharedAuthForms.css';
@import '../shared.css';

#credentials-form {
    width: 300px;
}

#collapsible {
    display: flex;
    flex-direction: row;
    cursor: pointer;
}
</style>
