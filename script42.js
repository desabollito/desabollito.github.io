angular
    .module('webApp')
    .directive('jsonEditor', function () {
        return {
            restrict: "A",
            require: 'ngModel',
            scope: {
                ngModel: '='
            },
            link: function (scope, element, attrs, ctrl) {
                initJSONEditor(element[0], scope.ngModel.Template);
            }
        }
    });