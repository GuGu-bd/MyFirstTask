# MyFirstTask
Test111

遇到的困难：
1.经常git push失败 解决方法：git没有使用到vpn，需要使用git config --gloval输入vpn的端口进行配置
2.对于git分支：初步完成阶段一 游戏的完成 时，创建的分支用来完成ai是从game分支中分出去的，并没有从main中分出去，导致形成的结构为
main
 │
 └── snake-game
       │
       └── snake-ai
             │
             └── 当时准备做的 snake-score
而不是更加理想的：
main
 │
 └── snake-game（在此分支中再去添加后续的新添功能）
 │     
 └── snake-ai
最终解决方法为在snake-ai中进行分支snake-enhancement再到最后合并到main中

