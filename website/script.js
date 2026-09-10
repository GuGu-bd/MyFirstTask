// ===============================
// fullPage.js 初始化
// ===============================



new fullpage(

    "#fullpage",

    {



        // =====================
        // 右侧导航
        // =====================


        navigation:true,


        navigationPosition:"right",



        // 页面锚点


        anchors:[

            "home",

            "about",

            "skill",

            "advantage",

            "contact"

        ],



        // =====================
        // 滚动设置
        // =====================


        autoScrolling:true,


        fitToSection:true,


        keyboardScrolling:true,


        scrollingSpeed:1000,



        easingcss3:

        "cubic-bezier(.77,0,.18,1)",





        // =====================
        // 页面加载动画
        // =====================


        afterLoad:function(

            origin,

            destination

        ){



            const elements =

            destination.item.querySelectorAll(

                ".reveal"

            );




            elements.forEach(

                (item,index)=>{


                    setTimeout(()=>{


                        item.classList.add(

                            "active"

                        );



                    },index*150);



                }


            );



        },









        // =====================
        // 离开页面重置动画
        // =====================


        onLeave:function(

            origin,

            destination,

            direction

        ){



            const elements =

            origin.item.querySelectorAll(

                ".reveal"

            );



            elements.forEach(

                item=>{


                    item.classList.remove(

                        "active"

                    );


                }


            );


        }





    }

);









// ===============================
// 顶部导航点击跳转
// ===============================



const navLinks =

document.querySelectorAll(

    "nav a"

);





navLinks.forEach(

    link=>{


        link.addEventListener(

            "click",

            function(e){



                e.preventDefault();



                const target =

                this

                .getAttribute("href")

                .replace("#","");



                fullpage_api.moveTo(

                    target

                );



            }


        );


    }

);









// ===============================
// 导航栏透明变化
// ===============================



const header =

document.querySelector(

    "header"

);



fullpage_api.setAllowScrolling(true);





fullpage_api.setKeyboardScrolling(true);









// ===============================
// 芯片交互动画
// ===============================



const chip =

document.querySelector(

    ".chip"

);





if(chip)

{


    chip.addEventListener(

        "mouseenter",

        ()=>{


            chip.style.transform =

            "scale(1.08)";



            chip.style.boxShadow =

            "0 0 90px #00aeef";



        }


    );




    chip.addEventListener(

        "mouseleave",

        ()=>{


            chip.style.transform =

            "scale(1)";



            chip.style.boxShadow =

            "0 0 50px #00aeef";



        }


    );



}