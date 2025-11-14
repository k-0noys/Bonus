let editor;
let originalZip = null;
let currentSectionIndex = 0;

// 에디터 초기화
window.addEventListener('load', () => {
    editor = new toastui.Editor({
        el: document.querySelector('#editor'),
        height: '100vh',
        initialEditType: 'wysiwyg',
        previewStyle: 'vertical',
        hideModeSwitch: true,
        toolbarItems: [
            ['heading', 'bold', 'italic', 'strike'],
            ['hr', 'quote'],
            ['ul', 'ol', 'task', 'indent', 'outdent'],
            ['table', 'image', 'link']
        ]
    });

    // 저장 버튼에 이벤트 리스너 추가
    document.querySelector('.toolbar .btn:nth-child(2)').addEventListener('click', saveHwpxFile);

    // 맞춤법 검사 버튼 추가
    const spellCheckBtn = document.createElement('button');
    spellCheckBtn.className = 'btn';
    spellCheckBtn.textContent = '맞춤법 검사';
    spellCheckBtn.id = 'spellCheckBtn';
    spellCheckBtn.addEventListener('click', checkSpelling);
    document.querySelector('.toolbar').appendChild(spellCheckBtn);
});

// 한글 파일 불러오기
async function loadHwpFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.hwpx')) {
            await loadHwpxFile(file);
        } else if (fileName.endsWith('.hwp')) {
            alert('구버전 .hwp 파일은 지원하지 않습니다.\n\n한글에서 "다른 이름으로 저장" → .hwpx 형식으로 저장 후 다시 시도해주세요.');
        } else {
            alert('지원하지 않는 파일 형식입니다.');
        }
    } catch (error) {
        console.error('파일 로드 에러:', error);
        alert('파일을 불러오는데 실패했습니다: ' + error.message);
    }

    event.target.value = '';
}

// HWPX 파일 파싱
async function loadHwpxFile(file) {
    const zip = await JSZip.loadAsync(file);
    originalZip = zip;

    let sectionXml = null;
    for (let i = 0; i < 100; i++) {
        const sectionFile = zip.file(`Contents/section${i}.xml`);
        if (sectionFile) {
            currentSectionIndex = i;
            const xmlText = await sectionFile.async('text');
            sectionXml = xmlText;
            break;
        }
    }

    if (!sectionXml) {
        throw new Error('문서 내용을 찾을 수 없습니다.');
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(sectionXml, 'text/xml');
    const paragraphs = xmlDoc.getElementsByTagName('hp:p');
    let htmlContent = '';

    for (let para of paragraphs) {
        const textNodes = para.getElementsByTagName('hp:t');
        let paraText = '';

        for (let node of textNodes) {
            paraText += node.textContent;
        }

        if (paraText.trim()) {
            htmlContent += `<p>${paraText.trim()}</p>`;
        } else {
            htmlContent += '<p><br></p>';
        }
    }

    editor.setHTML(htmlContent || '<p>문서 내용을 불러왔습니다.</p>');
    alert('파일을 불러왔습니다!');
}

// 맞춤법 검사 함수
async function checkSpelling() {
    if (!editor) {
        alert('에디터가 초기화되지 않았습니다.');
        return;
    }

    const content = editor.getHTML();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const paragraphs = tempDiv.querySelectorAll('p');

    if (paragraphs.length === 0) {
        alert('검사할 내용이 없습니다.');
        return;
    }

    const btn = document.getElementById('spellCheckBtn');
    btn.disabled = true;
    btn.textContent = '검사 중...';

    try {
        let correctedHTML = '';
        let totalErrors = 0;

        for (let para of paragraphs) {
            const text = para.textContent.trim();

            if (!text) {
                correctedHTML += '<p><br></p>';
                continue;
            }

            // 부산대 맞춤법 검사기 API 호출
            const result = await checkWithPusanAPI(text);
            if (result.corrected) {
                correctedHTML += `<p>${result.corrected}</p>`;
                totalErrors += result.errorCount;
            } else {
                correctedHTML += `<p>${text}</p>`;
            }
        }

        editor.setHTML(correctedHTML);

        if (totalErrors > 0) {
            alert(`맞춤법 검사 완료!\n총 ${totalErrors}개의 오류를 수정했습니다.`);
        } else {
            alert('맞춤법 검사 완료!\n오류가 발견되지 않았습니다.');
        }
    } catch (error) {
        console.error('맞춤법 검사 에러:', error);
        alert('맞춤법 검사 중 오류가 발생했습니다.\n네트워크 연결을 확인해주세요.');
    } finally {
        btn.disabled = false;
        btn.textContent = '맞춤법 검사';
    }
}

// 맞춤법 검사 API 호출 (Vercel Serverless Function 사용)
async function checkWithPusanAPI(text) {
    try {
        // 로컬 테스트용: http://localhost:3000/api/spell-check
        // 배포 후: /api/spell-check (상대 경로)
        const response = await fetch('/api/spell-check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: text })
        });

        if (!response.ok) {
            throw new Error('API 응답 실패');
        }

        const data = await response.json();

        return {
            corrected: data.corrected || text,
            errorCount: data.errorCount || 0
        };

    } catch (error) {
        console.error('맞춤법 검사 API 오류:', error);
        // 오류 시 원문 반환
        return {
            corrected: text,
            errorCount: 0
        };
    }
}

// HWPX 파일 저장
async function saveHwpxFile() {
    if (!originalZip) {
        alert('먼저 파일을 불러와주세요.');
        return;
    }

    if (!editor) {
        alert('에디터가 초기화되지 않았습니다.');
        return;
    }

    try {
        const btn = event.target;
        btn.disabled = true;
        btn.textContent = '저장 중...';

        // 에디터에서 수정된 HTML 가져오기
        const content = editor.getHTML();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const paragraphs = tempDiv.querySelectorAll('p');

        // 원본 XML 가져오기
        const sectionFile = originalZip.file(`Contents/section${currentSectionIndex}.xml`);
        const xmlText = await sectionFile.async('text');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        // XML의 <hp:p> 태그들 가져오기
        const xmlParagraphs = xmlDoc.getElementsByTagName('hp:p');

        // 각 문단의 텍스트 노드 업데이트
        let htmlParaIndex = 0;
        for (let i = 0; i < xmlParagraphs.length && htmlParaIndex < paragraphs.length; i++) {
            const textNodes = xmlParagraphs[i].getElementsByTagName('hp:t');

            if (textNodes.length > 0) {
                const newText = paragraphs[htmlParaIndex].textContent.trim();

                // 첫 번째 텍스트 노드에 새 내용 설정
                textNodes[0].textContent = newText;

                // 나머지 텍스트 노드는 비우기
                for (let j = 1; j < textNodes.length; j++) {
                    textNodes[j].textContent = '';
                }

                htmlParaIndex++;
            }
        }

        // 수정된 XML을 문자열로 변환
        const serializer = new XMLSerializer();
        const updatedXml = serializer.serializeToString(xmlDoc);

        // ZIP에 수정된 XML 다시 넣기
        originalZip.file(`Contents/section${currentSectionIndex}.xml`, updatedXml);

        // ZIP 파일 생성
        const blob = await originalZip.generateAsync({ type: 'blob' });

        // 다운로드
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '수정된문서.hwpx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert('파일이 저장되었습니다!');
    } catch (error) {
        console.error('저장 에러:', error);
        alert('파일 저장 중 오류가 발생했습니다: ' + error.message);
    } finally {
        const btn = event.target;
        btn.disabled = false;
        btn.textContent = '저장';
    }
}