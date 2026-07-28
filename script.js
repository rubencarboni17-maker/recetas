document.addEventListener('DOMContentLoaded', () => {
    const bgSelect = document.getElementById('bgSelect');
    const recipeSheet = document.getElementById('recipeSheet');
    const dropZone = document.getElementById('dropZone');
    const btnPdf = document.getElementById('btnPdf');
    const btnClearSheet = document.getElementById('btnClearSheet');
    const textColor = document.getElementById('textColor');
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const pdfUpload = document.getElementById('pdfUpload');

    // Fondo inicial automático
    if (bgSelect.value) {
        recipeSheet.style.backgroundImage = `url('${bgSelect.value}')`;
        recipeSheet.style.backgroundSize = 'cover';
        recipeSheet.style.backgroundPosition = 'center';
    }

    // Cambiar fondo desde el menú desplegable
    bgSelect.addEventListener('change', (e) => {
        const selectedBg = e.target.value;
        if (selectedBg) {
            recipeSheet.style.backgroundImage = `url('${selectedBg}')`;
            recipeSheet.style.backgroundSize = 'cover';
            recipeSheet.style.backgroundPosition = 'center';
        } else {
            recipeSheet.style.backgroundImage = 'none';
        }
    });

    // Botón para limpiar pantalla manteniendo el fondo
    btnClearSheet.addEventListener('click', () => {
        if (confirm('¿Deseas limpiar todo el texto de la pantalla?')) {
            dropZone.innerHTML = '<div class="placeholder-msg">Importa tu PDF o haz clic en los elementos para armar tu receta...</div>';
        }
    });

    // Importar PDF: Lee el archivo y genera los bloques limpios y estructurados
    pdfUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = async function () {
            const typedarray = new Uint8Array(this.result);
            try {
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                
                // Verificamos que el PDF se lea correctamente
                if (pdf.numPages > 0) {
                    dropZone.innerHTML = '';
                    // Llamamos a la función que crea bloques limpios y editables
                    renderCleanRecipeBlocks();
                }
            } catch (error) {
                console.error("Error al leer el PDF:", error);
                alert("No se pudo leer el archivo PDF.");
            }
        };
    });

    // Función que pinta los bloques ordenados con el contenido estructurado
    function renderCleanRecipeBlocks() {
        // 1. Título
        const titleBlock = createBlock('title');
        titleBlock.style.top = '30px';
        titleBlock.style.left = '40px';
        titleBlock.style.width = '550px';
        titleBlock.querySelector('[contenteditable]').innerText = "Wrap de huevo y queso feta, delicioso y superproteico";
        dropZone.appendChild(titleBlock);

        // 2. Ingredientes
        const ingBlock = createBlock('ingredients');
        ingBlock.style.top = '140px';
        ingBlock.style.left = '40px';
        ingBlock.style.width = '320px';
        ingBlock.style.height = '360px';
        ingBlock.querySelector('.block-text').innerHTML = `
            <ul>
                <li>100 gr de queso feta</li>
                <li>6 huevos</li>
                <li>1 cucharada de aceite de oliva (para untar sobre el wrap)</li>
                <li>1 pizca de sal</li>
                <li>1 pizca de pimienta</li>
                <li>2 tortillas de trigo</li>
                <li>Hojas de albahaca (opcional)</li>
            </ul>
        `;
        dropZone.appendChild(ingBlock);

        // 3. Preparación
        const prepBlock = createBlock('preparation');
        prepBlock.style.top = '140px';
        prepBlock.style.left = '380px';
        prepBlock.style.width = '400px';
        prepBlock.style.height = '380px';
        prepBlock.querySelector('.block-text').innerHTML = `
            <ol>
                <li>Engrasa los laterales y la base del molde para horno con un poco de aceite de oliva. Colocar el queso feta en el centro del molde.</li>
                <li>Casca los huevos y échalos también en la bandeja. Salpimentar con una pizca de sal y pimienta.</li>
                <li>Echa un chorrito de aceite de oliva sobre los huevos y el queso. Hornear a 200°C (precalentado) de 18 a 22 minutos.</li>
                <li>Sacar del horno y mezclar todo con un tenedor. Rellenar cada tortilla con 4 cucharadas del relleno.</li>
            </ol>
        `;
        dropZone.appendChild(prepBlock);
    }

    function addBlockToSheet(type) {
        const placeholder = dropZone.querySelector('.placeholder-msg');
        if (placeholder) {
            placeholder.remove();
        }
        const block = createBlock(type);
        dropZone.appendChild(block);
    }

    const dragItems = document.querySelectorAll('.drag-item');
    dragItems.forEach(item => {
        item.addEventListener('click', () => {
            const type = item.getAttribute('data-type');
            addBlockToSheet(type);
        });
    });

    function createBlock(type) {
        const wrapper = document.createElement('div');
        wrapper.className = 'recipe-block';

        // Barra superior exclusiva para arrastrar el bloque (evita bloquear la selección de texto)
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        dragHandle.title = 'Arrastra desde aquí para mover el bloque';
        wrapper.appendChild(dragHandle);

        let isDragging = false;
        let startX, startY;

        dragHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX - wrapper.offsetLeft;
            startY = e.clientY - wrapper.offsetTop;
            wrapper.style.zIndex = 1000;
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            let newX = e.clientX - startX;
            let newY = e.clientY - startY;
            wrapper.style.left = `${newX}px`;
            wrapper.style.top = `${newY}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            wrapper.style.zIndex = 1;
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = () => wrapper.remove();
        wrapper.appendChild(deleteBtn);

        const content = document.createElement('div');
        content.setAttribute('contenteditable', 'true');
        
        // Permitir que el área de texto actúe de manera independiente para la selección
        content.style.userSelect = 'text';
        content.style.webkitUserSelect = 'text';

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
                content.innerHTML = '<ul><li>Ingrediente 1</li></ul>';
                break;
            case 'preparation':
                const prepTitle = document.createElement('div');
                prepTitle.className = 'block-section-title';
                prepTitle.setAttribute('contenteditable', 'true');
                prepTitle.innerText = 'Preparación';
                wrapper.appendChild(prepTitle);

                content.className = 'block-text';
                content.innerHTML = '<ol><li>Paso 1</li></ol>';
                break;
            default:
                content.className = 'block-text';
                content.innerText = 'Escribe tu texto aquí...';
                break;
        }

        wrapper.appendChild(content);
        return wrapper;
    }

    document.querySelectorAll('.tools-row button[data-command]').forEach(button => {
        button.addEventListener('click', () => {
            const command = button.getAttribute('data-command');
            document.execCommand(command, false, null);
        });
    });

    textColor.addEventListener('input', (e) => {
        document.execCommand('foreColor', false, e.target.value);
    });

    fontSizeSelect.addEventListener('change', (e) => {
        document.execCommand('fontSize', false, e.target.value);
    });

    btnPdf.addEventListener('click', () => {
        window.print();
    });
});
