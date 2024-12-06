pipeline {
    agent any

    environment {
        KALI_USER = 'kali'
        KALI_HOST = '192.168.1.100'
        GITHUB_REPO = 'https://github.com/NassG5/cloud-storage-webapp.git'
    }

    stages {
        stage('Run Vulnerability Scan') {
            steps {
                sshCommand remote: [
                    name: 'Kali',
                    host: env.KALI_HOST,
                    user: env.KALI_USER,
                    credentialsId: 'c5b5ceae-eb62-4475-bd1b-6d952959d770'
                ], command: '''
                python3 /home/kali/zap_auto.py
                '''
            }
        }

        stage('Update Web Application') {
            steps {
                sshCommand remote: [
                    name: 'Kali',
                    host: env.KALI_HOST,
                    user: env.KALI_USER,
                    credentialsId: 'c5b5ceae-eb62-4475-bd1b-6d952959d770'
                ], command: '''
                cd /home/kali
                if [ -d cloud-storage-webapp ]; then
                    cd cloud-storage-webapp
                    git pull
                else
                    git clone ${env.GITHUB_REPO}
                    cd cloud-storage-webapp
                fi
                npm install
                node index.js &
                '''
            }
        }
    }

    post {
        success {
            echo 'Pipeline executed successfully.'
        }
        failure {
            echo 'Pipeline execution failed. Please check the logs.'
        }
    }
}
