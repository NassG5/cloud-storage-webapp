fetch('/user/files')
    .then(response => response.json())
    .then(files => {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';
        files.forEach(file => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.textContent = file;

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Supprimer';
            deleteBtn.className = 'btn btn-danger btn-sm';
            deleteBtn.onclick = () => {
                fetch('/user/files/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileName: file })
                }).then(() => location.reload());
            };

            li.appendChild(deleteBtn);
            fileList.appendChild(li);
        });
    })
    .catch(err => console.error('Erreur lors du chargement des fichiers :', err));
