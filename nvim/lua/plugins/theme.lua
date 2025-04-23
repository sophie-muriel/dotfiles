return {
  "rebelot/kanagawa.nvim",
  priority = 1000,
  config = function()
    require("kanagawa").setup({
      theme = "dragon",
    })
    vim.cmd("colorscheme kanagawa-dragon")
  end,
}
