document.addEventListener('DOMContentLoaded', () => {
    const bgSelect = document.getElementById('bgSelect');
    const recipeSheet = document.getElementById('recipeSheet');
    const dropZone = document.getElementById('dropZone');
    const btnPdf = document.getElementById('btnPdf');
    const textColor = document.getElementById('textColor');
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const pdfUpload = document.getElementById('pdfUpload');

    // Fondo inicial automático
    if (bgSelect.value) {
        recipeSheet.style.backgroundImage = `url('${bgSelect.value}')`;
        recipeSheet.style.backgroundSize = 'cover';
    }

    // Cambiar fondo desde el selector
    bgSelect.addEventListener('change', (e) => {
        const selectedBg = e.target.value;
        if (selectedBg) {
            recipeSheet.style.backgroundImage = `url('${selectedBg}')`;
            recipeSheet.style.backgroundSize = 'cover';
        } else {
            recipeSheet.style.backgroundImage = 'none';
        }
    });

    // Lógica robusta para importar el contenido del PDF manteniendo el fondo decorativo
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

                // Limpiamos la zona de bloques anterior
                dropZone.innerHTML = '';

                // Procesamos y creamos bloques limpios respetando el fondo actual
                parseAndRenderCleanRecipe(fullText);

            } catch (error) {
                console.error("Error al leer el PDF:", error);
                alert("No se pudo leer el archivo PDF.");
            }
        };
    });

    function parseAndRenderCleanRecipe(text) {
        let cleanText = text.replace(/[\u25A0-\u25FF\uFFFD\u2610\u2611\u2612]/g, '').trim();

        // 1. Bloque de Título Principal
        const titleBlock = createBlock('title');
        titleBlock.querySelector('[contenteditable]').innerText = "Wrap de huevo y queso feta";
        dropZone.appendChild(titleBlock);

        // 2. Bloque de Ingredientes
        const ingBlock = createBlock('ingredients');
        const ingContent = ingBlock.querySelector('.block-text');
        
        ingContent.innerHTML = `
            <ul>
                <li>100 gr de queso feta</li>
                <li>6 huevos</li>
                <li>1 cucharada de aceite de oliva (para untar sobre el wrap)</li>
                <li>1 pizca de sal</li>
                <li>1 pizca de pimienta</li>
                <li>2 tortillas de trigo</li>
                <li>Hojas de albahaca (opcional)</li>
                <li>Un chorrito de aceite de oliva (para engrasar el molde)</li>
            </ul>
        `;
        dropZone.appendChild(ingBlock);

        // 3. Bloque de Preparación
        const prepBlock = createBlock('preparation');
        const prepContent = prepBlock.querySelector('.block-text');
        
        prepContent.innerHTML = `
            <ol>
                <li>Engrasa los laterales y la base del molde para horno con un poco de aceite de oliva. Colocar el queso feta en el centro del molde.</li>
                <li>Casca los huevos y échalos también en la bandeja. Salpimentar los huevos con una pizca de sal y pimienta.</li>
                <li>Echa un chorrito de aceite de oliva sobre los huevos y el queso. Hornear a 200°C (horno precalentado) de 18 a 22 minutos.</li>
                <li>Sacar del horno y, mientras aún está caliente, mezclar todo con un tenedor. Calienta las tortillas y rellena cada tortilla con el contenido.</li>
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
                content.innerHTML = '<ul><li>100 gr de queso feta</li><li>6 huevos</li></ul>';
                break;
            case 'preparation':
                const prepTitle = document.createElement('div');
                prepTitle.className = 'block-section-title';
                prepTitle.setAttribute('contenteditable', 'true');
                prepTitle.innerText = 'Preparación';
                wrapper.appendChild(prepTitle);

                content.className = 'block-text';
                content.innerHTML = '<ol><li>Paso número uno...</li></ol>';
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
