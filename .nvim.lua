function BircleUpdate()
    vim.ui.input({ prompt = "New Version No " }, function (input)
        local parts = vim.split(input, "%.")
        local major = parts[1]
        local minor = parts[2]
        local bug = parts[3]
        local bug_extra_parts = vim.split(bug, "_")
        bug = bug_extra_parts[1]
        local extra = bug_extra_parts[2] or ""
        local line_of_code = "const VERSION = { major: " .. major .. ", minor: " .. minor .. ", bug: " .. bug .. ", part: \"" .. extra .. "\", beta: false, alpha: false }"
        vim.cmd[[:edit src/common.ts]]
        vim.cmd("g/^const VERSION.*/norm cc" .. line_of_code)
        vim.system({"./make-changelog", input})
    end)
end

vim.api.nvim_create_user_command("BircleUpdate", BircleUpdate, { })
