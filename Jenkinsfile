pipeline {
    // Provision and verify this label before enabling the multibranch job.
    agent { label 'web-ci' }

    options {
        disableConcurrentBuilds()
        timeout(time: 20, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '5'))
        skipDefaultCheckout(true)
        timestamps()
    }

    environment {
        CI = 'true'
        NG_CLI_ANALYTICS = 'false'
        PNPM_STORE_DIR = "${WORKSPACE}/.pnpm-store"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Verify toolchain') {
            steps {
                sh 'node scripts/verify-ci-toolchain.cjs'
            }
        }
        stage('Install dependencies') {
            steps {
                sh 'pnpm install --frozen-lockfile --store-dir "$PNPM_STORE_DIR"'
            }
        }
        stage('Lint') {
            steps {
                sh 'pnpm lint'
            }
        }
        stage('Unit and component tests') {
            steps {
                sh 'mkdir -p reports && pnpm exec ng test --watch=false --reporters=junit --output-file=reports/unit-tests.xml'
            }
        }
        stage('Production build') {
            steps {
                sh 'pnpm build'
            }
        }
    }

    post {
        always {
            script {
                if (fileExists('reports/unit-tests.xml')) {
                    junit testResults: 'reports/unit-tests.xml', allowEmptyResults: false
                }
            }
            archiveArtifacts artifacts: 'reports/*.xml', allowEmptyArchive: true
            deleteDir()
        }
    }
}
