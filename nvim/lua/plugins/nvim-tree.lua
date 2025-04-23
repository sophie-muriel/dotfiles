return {
  'nvim-tree/nvim-tree.lua',
  config = function()
    
    local nvim_tree = require('nvim-tree')

    nvim_tree.setup({
      open_on_tab = true,
      hijack_cursor = true,
      update_cwd = true,
      update_focused_file = {
        enable = true,
        update_cwd = false,
      },
      view = {
        width = 30,
        side = 'left',
      },
    })

    vim.api.nvim_set_keymap('n', '<leader>e', ':NvimTreeToggle<CR>', { noremap = true, silent = true })

    vim.cmd("autocmd VimEnter * NvimTreeOpen")
  end
}
