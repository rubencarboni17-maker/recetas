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

    // Importar PDF: Extrae el contenido real y lo distribuye dinámicamente
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

                // Limpiamos la zona de la hoja
                dropZone.innerHTML = '';

                // Procesamos el texto real extraído del PDF
                renderDynamicImportedRecipe(fullText);

            } catch (error) {
                console.error("Error al leer el PDF:", error);
                alert("No se pudo leer el archivo PDF.");
            }
        };
    });

    // Función que analiza y distribuye el texto real del PDF en los bloques
    function renderDynamicImportedRecipe(rawText) {
        // Limpieza básica de caracteres no deseados
        let cleanText = rawText.replace(/[\u25A0-\u25FF\uFFFD]/g, '').trim();

        // Intentamos separar secciones comunes de recetas de forma automática o estructurada
        let lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        let titleText = lines.length > 0 ? lines[0] : "Receta Importada";
        
        // Creamos el Bloque de Título con el texto real
        const titleBlock = createBlock('title');
        titleBlock.style.top = '30px';
        titleBlock.style.left = '40px';
        titleBlock.style.width = '600px';
        titleBlock.querySelector('[contenteditable]').innerText = titleText;
        dropZone.appendChild(titleBlock);

        // Bloque de Ingredientes con el texto extraído (o por defecto si el PDF viene en otro formato)
        const ingBlock = createBlock('ingredients');
        ingBlock.style.top = '120px';
        ingBlock.style.left = '40px';
        ingBlock.style.width = '350px';
        ingBlock.style.height = '350px';
        
        ingBlock.querySelector('.block-text').innerHTML = `
            <ul>
                ${lines.slice(1, 8).map(item => `<li>${item}</li>`).join('')}
            </ul>
        `;
        dropZone.appendChild(ingBlock);

        // Bloque de Preparación con el resto del contenido real del PDF
        const prepBlock = createBlock('preparation');
        prepBlock.style.top = '120px';
        prepBlock.style.left = '410px';
        prepBlock.style.width = '420px';
        prepBlock.style.height = '380px';
        
        const prepSteps = lines.slice(8, 18);
        prepBlock.querySelector('.block-text').innerHTML = `
            <ol>
                ${prepSteps.length > 0 ? prepSteps.map(step => `<li>${step}</li>`).join('') : `<li>${cleanText}</li>`}
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

        // Lógica para arrastrar el bloque libremente por la hoja
        let isDragging = false;
        let startX, startY;

        wrapper.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.getAttribute('contenteditable') === 'true') return;
            isDragging = true;
            startX = e.clientX - wrapper.offsetLeft;
            startY = e.clientY - wrapper.offsetTop;
            wrapper.style.zIndex = 1000;
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
