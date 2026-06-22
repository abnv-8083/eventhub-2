import os, glob, re

target_dir = r'd:\EventHub2\src\views'
files = glob.glob(target_dir + '/**/*.ejs', recursive=True)
count = 0
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    new_content = re.sub(r"toLocaleDateString\(\s*['\"]en-(?:IN|US)['\"]\s*,", "toLocaleDateString(undefined,", content)
    new_content = re.sub(r"toLocaleDateString\(\s*['\"]en-(?:IN|US)['\"]\s*\)", "toLocaleDateString()", new_content)
    
    if new_content != content:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(new_content)
        count += 1
print(f'Replaced in {count} files.')
