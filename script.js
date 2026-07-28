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

    // Importación limpia de PDF en un contenedor unificado y totalmente editable
    pdfUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = async function () {
            const typedarray = new Uint8Array(this.result);
            try {
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = "";

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(" ");
                    fullText += pageText + "\n";
                }

                // Limpiamos la zona de trabajo
                dropZone.innerHTML = '';

                // Creamos un bloque único limpio con todo el texto del PDF formateado
                renderUnifiedPdfBlock(fullText);

            } catch (error) {
                console.error("Error al leer el PDF:", error);
                alert("No se pudo leer el archivo PDF.");
            }
        };
    });

    function renderUnifiedPdfBlock(rawText) {
        let cleanText = rawText.replace(/[\u25A0-\u25FF\uFFFD]/g, '').trim();

        const wrapper = document.createElement('div');
        wrapper.className = 'recipe-block';
        wrapper.style.top = '30px';
        wrapper.style.left = '40px';
        wrapper.style.width = '700px';
        wrapper.style.height = '600px';

        // Botón de eliminar bloque
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = () => wrapper.remove();
        wrapper.appendChild(deleteBtn);

        // Contenedor de texto principal con formato editable y selección con mouse libre
        const content = document.createElement('div');
        content.setAttribute('contenteditable', 'true');
        content.className = 'block-text';
        content.style.userSelect = 'text';
        content.style.webkitUserSelect = 'text';
        content.style.height = 'calc(100% - 20px)';
        content.style.overflowY = 'auto';
        content.style.padding = '10px';
        
        // Convertimos los saltos de línea en párrafos o textos legibles
        content.innerHTML = `<p style="font-size: 16px; line-height: 1.6;">${cleanText.replace(/\n/g, '<br>')}</p>`;

        wrapper.appendChild(content);

        // Lógica de arrastre limpia utilizando el fondo o bordes del contenedor (sin interferir con el texto)
        let isDragging = false;
        let startX, startY;

        wrapper.addEventListener('mousedown', (e) => {
            // Si hace clic directamente dentro del texto editable, no arrastra, permite seleccionar
            if (e.target.closest('[contenteditable="true"]')) return;
            isDragging = true;
            startX = e.clientX - wrapper.offsetLeft;
            startY = e.clientY - wrapper.offsetTop;
            wrapper.style.zIndex = 1000;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            wrapper.style.left = `${e.clientX - startX}px`;
            wrapper.style.top = `${e.clientY - startY}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            wrapper.style.zIndex = 1;
        });

        dropZone.appendChild(wrapper);
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

        let isDragging = false;
        let startX, startY;

        wrapper.addEventListener('mousedown', (e) => {
            if (e.target.closest('[contenteditable="true"]')) return;
            isDragging = true;
            startX = e.clientX - wrapper.offsetLeft;
            startY = e.clientY - wrapper.offsetTop;
            wrapper.style.zIndex = 1000;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            wrapper.style.left = `${e.clientX - startX}px`;
            wrapper.style.top = `${e.clientY - startY}px`;
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
