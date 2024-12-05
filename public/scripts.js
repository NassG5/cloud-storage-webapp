// Charger dynamiquement la liste des fichiers
fetch('/user/files')
    .then(response => response.json())
    .then(data => {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';
        data.forEach(file => {
            const li = document.createElement('li');
            li.textContent = file;
            fileList.appendChild(li);
        });
    })
    .catch(err => {
        console.error('Erreur lors du chargement des fichiers :', err);
        document.getElementById('fileList').innerHTML = '<li>Erreur lors du chargement des fichiers.</li>';
    });
