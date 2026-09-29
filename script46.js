angular.module('app.services', [])
    .service('popupService', ['$window', '$uibModal', function ($window, $uibModal) {
        this.showPopup = function (message) {
            return $window.confirm(message);
        }

        this.showMessage = function (message, title, size) {
            var modalOptions = {
                templateUrl: 'messageModal.html',
                controller: ['$uibModalInstance', 'message', 'title', function ($uibModalInstance, message, title) {
                    var vm = this;
                    vm.message = message;
                    vm.title = title;
                    vm.close = function () {
                        $uibModalInstance.close();
                    }
                }],
                controllerAs: 'modalCtrl',
                size: size,
                backdrop: 'static',
                animation: true,
                resolve: {
                    message: function () {
                        return message;
                    },
                    title: function () {
                        return title;
                    }
                }
            };
            var modal = $uibModal.open(modalOptions);
            return modal.result;
        }

        this.showConfirm = function (message, title, size) {
            return this.showConfirmWithButtonName(message, title, size, { aceptar: 'Aceptar', cancelar:'Cancelar' });
        }

        this.showConfirmWithButtonName = function (message, title, size, nameButton) {
            var modalOptions = {
                templateUrl: 'confirmModal.html',
                controller: ['$uibModalInstance', 'message', 'title', function ($uibModalInstance, message, title) {
                    var vm = this;
                    vm.message = message;
                    vm.title = title;
                    vm.nameButtonAceptar = nameButton.aceptar;
                    vm.nameButtonCancelar = nameButton.cancelar;
                    vm.cancel = function () {
                        $uibModalInstance.dismiss('cancel');
                    }
                    vm.aceptar = function () {
                        $uibModalInstance.close();
                    }
                }],
                controllerAs: 'modalCtrl',
                size: size,
                backdrop: 'static',
                animation: true,
                resolve: {
                    message: function () {
                        return message;
                    },
                    title: function () {
                        return title;
                    }
                }
            };
            var modal = $uibModal.open(modalOptions);
            return modal.result;
        }
    }])
    .service('dataTableHttpService', ['$http', function ($http) {
        this.get = function (url, params, data, callback) {
            $http.get(url, {
                params: $.extend(data,
                    {
                        length: data.length,
                        start: data.start
                    },
                    params),
                cache: false
            }).then(function (res) {
                // map your server's response to the DataTables format and pass it to
                // DataTables' callback
                callback({
                    recordsTotal: res.data.recordsTotal,
                    recordsFiltered: res.data.recordsFiltered,
                    data: res.data.data
                });
            });
        }

        this.post = function (url, params, data, callback) {
            $http.post(url,
                $.extend(data,
                    params),
                { cache: false })
                .then(function (res) {
                    // map your server's response to the DataTables format and pass it to
                    // DataTables' callback
                    callback({
                        recordsTotal: res.data.recordsTotal,
                        recordsFiltered: res.data.recordsFiltered,
                        data: res.data.data
                    });
                });
        }
    }])
    .service('baseDataService', ['$resource', function ($resource) {
        this.getService = function (route, pagedQuery, methods) {
            var _methods = {
                update: { method: 'PUT' }
            };

            if (pagedQuery) {
                angular.extend(_methods, { query: { method: 'GET', url: route + '?start=:start&length=:length', params: { start: '@start', length: '@length' } } });
            }

            angular.extend(_methods, methods);
            return $resource(route + '/:id', { id: '@id' }, _methods);
        }
    }]);