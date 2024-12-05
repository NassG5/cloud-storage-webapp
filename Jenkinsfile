pipeline {
    agent any

    environment {
        KALI_USER = 'kali'                   // Utilisateur sur la machine Kali
        KALI_HOST = '10.1.90.232'          // Adresse IP de la machine Kali
        PRIVATE_KEY = '/var/jenkins_home/.ssh/id_rsa'  // Chemin de la clé privée sur Jenkins
        GITHUB_REPO = 'https://github.com/NassG5/cloud-storage-webapp.git'
    }

    triggers {
        cron('H 2 * * *')  // Exécution quotidienne à 2h00
        pollSCM('* * * * *')  // Vérifie les modifications dans Git chaque minute
    }

    stages {
        stage('Run Vulnerability Scan') {
            steps {
                script {
                    sshCommand remote: [
                        user: env.KALI_USER,
                        host: env.KALI_HOST,
                        identityFile: env.PRIVATE_KEY
                    ], command: '''
                    python3 /home/kali/zap_auto.py
                    '''
                }
            }
        }

        stage('Update Web Application') {
            steps {
                script {
                    sshCommand remote: [
                        user: env.KALI_USER,
                        host: env.KALI_HOST,
                        identityFile: env.PRIVATE_KEY
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
