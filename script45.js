//EN DESARROLLO. COLO

//REFERENCIAS NECESARIAS
//<script src="Scripts/jquery.inputmask/inputmask.js"></script>
//<script src="Scripts/jquery.inputmask/jquery.inputmask.js"></script>
//<script src="Scripts/jquery.inputmask/inputmask.extensions.js"></script>
//<script src="Scripts/jquery.inputmask/inputmask.date.extensions.js"></script>
//<script src="Scripts/jquery.inputmask/inputmask.numeric.extensions.js"></script>

angular.module('inputMask', []);

angular
    .module('inputMask')
    .directive('inputMaskDate', function () {
        return {
            restrict: "A",
            link: function (scope, element, attrs, ctrl) {
                element.inputmask("date", { "placeholder": "dd/mm/aaaa" });
            }
        }
    })
    .directive('inputMaskRegex', function () {
        return {
            restrict: "A",
            scope: {
                regex: '@'
            },
            link: function (scope, element, attrs, ctrl) {
                element.inputmask("Regex", { "regex": scope.regex });
            }
        }
    })
    //< input type= "text" input- mask mask= "999-999999999/9999" class="form-control" name= "numeroCertificado" ng- model="precargaCtrl.numeroCertificado" required />
    .directive('inputMask', function () {
        return {
            restrict: "A",
            scope: {
                mask: '@'
            },
            link: function (scope, element, attrs, ctrl) {
                element.inputmask({ "mask": scope.mask, "clearIncomplete": true });
            }
        }
    });