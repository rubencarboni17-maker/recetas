document.addEventListener('DOMContentLoaded', () => {
    const bgSelect = document.getElementById('bgSelect');
    const recipeSheet = document.getElementById('recipeSheet');
    const dropZone = document.getElementById('dropZone');
    const btnPdf = document.getElementById('btnPdf');
    const textColor = document.getElementById('textColor');
    const fontSizeSelect = document.getElementById('fontSizeSelect');

    // Fondo inicial automático
    if (bgSelect.value) {
        recipeSheet.style.backgroundImage = `url('${bgSelect.value}')`;
    }

    // Cambiar fondo
    bgSelect.addEventListener('change', (e) => {
        const selectedBg = e.target.value;
        if (selectedBg) {
            recipeSheet.style.backgroundImage = `url('${selectedBg}')`;
        } else {
            recipeSheet.style.backgroundImage = 'none';
        }
    });

    // Lógica de Drag and Drop
    const dragItems = document.querySelectorAll('.drag-item');
    
    dragItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.getAttribute('data-type'));
        });
    });

    // IMPORTANTE: Prevenir el comportamiento por defecto en dragover y drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); // Esto elimina el icono de prohibido
        const type = e.dataTransfer.getData('text/plain');
        
        // Quitar mensaje inicial si existe
        const placeholder = dropZone.querySelector('.placeholder-msg');
        if (placeholder) {
            placeholder.remove();
        }

        const block = createBlock(type);
        dropZone.appendChild(block);
    });

    function createBlock(type) {
        const wrapper = document.createElement('div');
        wrapper.className = 'recipe-block';

        // Botón para eliminar bloque
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Eliminar elemento';
        deleteBtn.onclick = () => wrapper.remove();
        wrapper.appendChild(deleteBtn);

        const content = document.createElement('div');
        content.setAttribute('contenteditable', 'true');

        switch (type) {
            case 'title':
                content.className = 'block-title';
                content.innerText = 'Título de la Receta';
                break;
            case 'time':
                content.className = 'block-meta';
                content.innerText = '⏱️ Tiempo: 45 min';
                break;
            case 'complexity':
                content.className = 'block-meta';
                content.innerText = '⭐ Complejidad: Media';
                break;
            case 'portions':
                content.className = 'block-meta';
                content.innerText = '🍽️ Porciones: 4';
                break;
            case 'ingredients':
                const ingTitle = document.createElement('div');
                ingTitle.className = 'block-section-title';
                ingTitle.setAttribute('contenteditable', 'true');
                ingTitle.innerText = 'Ingredientes';
                wrapper.appendChild(ingTitle);

                content.className = 'block-text';
                content.innerHTML = '<ul><li>Ingrediente 1</li><li>Ingrediente 2</li></ul>';
                break;
            case 'preparation':
                const prepTitle = document.createElement('div');
                prepTitle.className = 'block-section-title';
                prepTitle.setAttribute('contenteditable', 'true');
                prepTitle.innerText = 'Preparación';
                wrapper.appendChild(prepTitle);

                content.className = 'block-text';
                content.innerHTML = '<ol><li>Paso número uno...</li><li>Paso número dos...</li></ol>';
                break;
            default:
                content.className = 'block-text';
                content.innerText = 'Escribe tu texto aquí...';
                break;
        }

        wrapper.appendChild(content);
        return wrapper;
    }

    // Comandos de formato de texto
    document.querySelectorAll('.tools-row button[data-command]').forEach(button => {
        button.addEventListener('click', () => {
            const command = button.getAttribute('data-command');
            document.execCommand(command, false, null);
        });
    });

    // Cambiar color de texto seleccionado
    textColor.addEventListener('input', (e) => {
        document.execCommand('foreColor', false, e.target.value);
    });

    // Cambiar tamaño de texto seleccionado
    fontSizeSelect.addEventListener('change', (e) => {
        document.execCommand('fontSize', false, e.target.value);
    });

    // Descargar PDF
    btnPdf.addEventListener('click', () => {
        window.print();
    });
});
